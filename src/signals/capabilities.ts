import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import type { Capability, Finding } from "../types.js";

const SOURCE_EXT = [".js", ".cjs", ".mjs", ".ts"];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // skip files too large to parse safely

const WEIGHTS: Record<Capability, number> = {
  "fs:read": 2,
  "fs:write": 6,
  net: 8,
  shell: 12,
  env: 10,
  obfuscated: 25,
};

const REASONS: Record<Capability, string> = {
  "fs:read": "reads files",
  "fs:write": "writes files",
  net: "accesses the network",
  shell: "runs shell commands",
  env: "reads environment variables / secrets",
  obfuscated: "ships obfuscated/minified source",
};

// Modules whose mere import is a strong capability signal. (Importing `fs` is
// too benign to flag on its own, so fs capabilities come from call sites only.)
const SHELL_MODULES = new Set(["child_process", "node:child_process"]);
const NET_MODULES = new Set([
  "http", "https", "net", "dgram", "tls", "http2",
  "node:http", "node:https", "node:net", "node:dgram", "node:tls", "node:http2",
  "axios", "node-fetch", "got", "undici", "superagent", "request",
]);

// `shell` is intentionally NOT inferred from call names: `child_process` has no
// global, so it's always imported (caught above), while `.exec()` is RegExp's
// method and `.fork()`/`.spawn()` have benign homonyms — matching those names
// is the classic false positive (lodash, dotenv use regex.exec heavily).
const FS_READ_CALLS = new Set([
  "readFile", "readFileSync", "createReadStream", "readdir", "readdirSync",
]);
const FS_WRITE_CALLS = new Set([
  "writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream",
  "copyFile", "copyFileSync", "rename", "renameSync", "unlink", "unlinkSync",
  "rm", "rmSync", "rmdir", "rmdirSync", "mkdir", "mkdirSync", "mkdtemp", "mkdtempSync",
]);

type AstNode = { type?: string; [key: string]: unknown };

const SKIP_KEYS = new Set([
  "loc", "start", "end", "range", "comments", "leadingComments", "trailingComments", "innerComments",
]);

function parseAst(code: string): AstNode | null {
  try {
    return parse(code, {
      sourceType: "unambiguous",
      plugins: ["typescript"],
      errorRecovery: true,
    }) as unknown as AstNode;
  } catch {
    return null;
  }
}

function walk(node: unknown, visit: (n: AstNode) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  const n = node as AstNode;
  if (typeof n.type === "string") visit(n);
  for (const key of Object.keys(n)) {
    if (SKIP_KEYS.has(key)) continue;
    walk(n[key], visit);
  }
}

// The string module name imported by this node, whether via `require("x")` or
// dynamic `import("x")`. Static `import ... from "x"` is handled separately.
function requiredModule(n: AstNode): string | null {
  if (n.type !== "CallExpression") return null;
  const callee = n.callee as AstNode | undefined;
  const isRequire = callee?.type === "Identifier" && (callee.name as string) === "require";
  const isDynamicImport = callee?.type === "Import";
  if (!isRequire && !isDynamicImport) return null;
  const arg = (n.arguments as AstNode[] | undefined)?.[0];
  if (arg?.type === "StringLiteral") return arg.value as string;
  return null;
}

// The called function's bare name for `fn()` or `obj.fn()`, plus whether the
// callee was a bare Identifier (a global/destructured call) vs. a member call.
function calledName(n: AstNode): { name: string; bare: boolean } | null {
  if (n.type !== "CallExpression") return null;
  const callee = n.callee as AstNode | undefined;
  if (callee?.type === "Identifier") return { name: callee.name as string, bare: true };
  if (callee?.type === "MemberExpression" && !(callee.computed as boolean)) {
    const prop = callee.property as AstNode | undefined;
    if (prop?.type === "Identifier") return { name: prop.name as string, bare: false };
  }
  return null;
}

// True when this node is the member access `process.env` (e.g. `process.env.X`).
function isProcessEnv(n: AstNode): boolean {
  if (n.type !== "MemberExpression") return false;
  const obj = n.object as AstNode | undefined;
  const prop = n.property as AstNode | undefined;
  return (
    obj?.type === "Identifier" &&
    (obj.name as string) === "process" &&
    prop?.type === "Identifier" &&
    (prop.name as string) === "env"
  );
}

function detectCapabilities(ast: AstNode): Set<Capability> {
  const caps = new Set<Capability>();
  walk(ast, (n) => {
    // import declarations
    if (n.type === "ImportDeclaration") {
      const src = (n.source as AstNode | undefined)?.value as string | undefined;
      if (src && SHELL_MODULES.has(src)) caps.add("shell");
      if (src && NET_MODULES.has(src)) caps.add("net");
      return;
    }
    const mod = requiredModule(n);
    if (mod) {
      if (SHELL_MODULES.has(mod)) caps.add("shell");
      if (NET_MODULES.has(mod)) caps.add("net");
    }
    const call = calledName(n);
    if (call) {
      // Only a bare `fetch(...)` is the network global; `obj.fetch()` is a
      // common benign method name (DB clients, query builders).
      if (call.bare && call.name === "fetch") caps.add("net");
      if (FS_READ_CALLS.has(call.name)) caps.add("fs:read");
      if (FS_WRITE_CALLS.has(call.name)) caps.add("fs:write");
    }
    if (isProcessEnv(n)) caps.add("env");
  });
  return caps;
}

// Real obfuscation defeats static reading; minification does not (the AST is
// identical). So we only flag the hallmark of automated obfuscators: a cluster
// of hex-mangled identifiers (e.g. `_0x3a4b`). Plain long/minified lines pass.
function looksObfuscated(code: string): boolean {
  const hexIdents = (code.match(/_0x[0-9a-f]{2,}/gi) ?? []).length;
  return hexIdents >= 5;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walkDir = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".git") continue;
      const p = join(d, entry);
      const s = lstatSync(p);
      if (s.isDirectory()) walkDir(p);
      else if (
        s.isFile() &&
        s.size <= MAX_FILE_BYTES && // bound parser memory on pathologically large files
        SOURCE_EXT.some((e) => p.endsWith(e)) &&
        !p.endsWith(".d.ts")
      ) {
        out.push(p);
      }
    }
  };
  walkDir(dir);
  return out;
}

export function capabilitiesSignal(dir: string): Finding[] {
  const found = new Map<Capability, Finding>();
  const add = (cap: Capability) => {
    if (!found.has(cap)) {
      found.set(cap, { id: cap === "obfuscated" ? "obfuscated" : `cap:${cap}`, weight: WEIGHTS[cap], reason: REASONS[cap], capability: cap });
    }
  };

  for (const file of listSourceFiles(dir)) {
    let code: string;
    try {
      code = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const ast = parseAst(code);
    if (!ast) continue; // unparseable / non-code asset

    if (looksObfuscated(code)) add("obfuscated");
    for (const cap of detectCapabilities(ast)) add(cap);
  }

  return [...found.values()];
}
