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
