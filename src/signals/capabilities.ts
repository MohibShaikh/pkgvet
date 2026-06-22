import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import type { Capability, Finding } from "../types.js";

const SOURCE_EXT = [".js", ".cjs", ".mjs", ".ts"];

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

// Pattern table over raw source. Deliberately simple and legible; AST is used
// only to confirm the file parses (a proxy that filters non-code assets).
const PATTERNS: Array<{ cap: Capability; re: RegExp }> = [
  { cap: "shell", re: /\b(child_process|execSync|spawnSync|\.exec\(|\.spawn\()/ },
  { cap: "net", re: /\b(https?\b.*request|fetch\(|net\.|dgram|require\(['"]https?['"]\))/ },
  { cap: "env", re: /process\.env/ },
  { cap: "fs:write", re: /\b(writeFile|writeFileSync|createWriteStream|appendFile)/ },
  { cap: "fs:read", re: /\b(readFile|readFileSync|createReadStream)/ },
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".git") continue;
      const p = join(d, entry);
      const s = lstatSync(p);
      if (s.isDirectory()) walk(p);
      else if (s.isFile() && SOURCE_EXT.some((e) => p.endsWith(e))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function looksObfuscated(code: string): boolean {
  const longLine = code.split("\n").some((l) => l.length > 1000);
  const hexIdents = (code.match(/_0x[0-9a-f]{2,}/gi) ?? []).length;
  return longLine || hexIdents >= 5;
}

function isParseable(code: string): boolean {
  try {
    parse(code, { sourceType: "unambiguous", plugins: ["typescript"], errorRecovery: true });
    return true;
  } catch {
    return false;
  }
}

export function capabilitiesSignal(dir: string): Finding[] {
  const found = new Map<Capability, Finding>();

  for (const file of listSourceFiles(dir)) {
    let code: string;
    try {
      code = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!isParseable(code)) continue; // skip non-code / unparseable assets

    if (looksObfuscated(code) && !found.has("obfuscated")) {
      found.set("obfuscated", {
        id: "obfuscated",
        weight: WEIGHTS.obfuscated,
        reason: REASONS.obfuscated,
        capability: "obfuscated",
      });
    }
    for (const { cap, re } of PATTERNS) {
      if (!found.has(cap) && re.test(code)) {
        found.set(cap, { id: `cap:${cap}`, weight: WEIGHTS[cap], reason: REASONS[cap], capability: cap });
      }
    }
  }

  return [...found.values()];
}
