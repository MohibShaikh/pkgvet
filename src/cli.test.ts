import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, expect, test, vi } from "vitest";
import { isMainModule, levelMeetsThreshold, run } from "./cli.js";

vi.mock("./analyze.js", () => ({
  analyze: async () => ({
    package: { name: "x", version: "1.0.0" },
    capabilities: [],
    findings: [],
    risk: { score: 0, level: "low" },
  }),
}));

vi.mock("./llm.js", () => ({
  llmOpinion: async () => {
    throw new Error("network down");
  },
}));

test("high meets a high threshold", () => {
  expect(levelMeetsThreshold("high", "high")).toBe(true);
});
test("med does not meet a high threshold", () => {
  expect(levelMeetsThreshold("med", "high")).toBe(false);
});
test("high meets a med threshold", () => {
  expect(levelMeetsThreshold("high", "med")).toBe(true);
});
test("low meets a low threshold", () => {
  expect(levelMeetsThreshold("low", "low")).toBe(true);
});

test("a failing --llm second opinion does not change the exit code", async () => {
  const code = await run(["node", "cli", "inspect", "x", "--llm"]);
  expect(code).toBe(0); // llm failure must NOT flip the exit code to 2
});

test("top-level help exits successfully", async () => {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await expect(run(["node", "cli", "--help"])).resolves.toBe(0);
  } finally {
    write.mockRestore();
  }
});

test("command help exits successfully", async () => {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await expect(run(["node", "cli", "inspect", "--help"])).resolves.toBe(0);
  } finally {
    write.mockRestore();
  }
});

// Regression: the entry-point guard once compared import.meta.url against a
// hand-built `file://${path}` string. When the install path contains a space
// (or any percent-encoded char), import.meta.url is encoded (file:///a%20b)
// but the concatenation is not (file:///a b), so they never match and the CLI
// runs nothing — exiting 0 with no output. The guard must encode identically.
const spacedDir = mkdtempSync(join(tmpdir(), "pkgvet space "));
afterAll(() => rmSync(spacedDir, { recursive: true, force: true }));

test("isMainModule matches even when the path contains a space", () => {
  const script = join(spacedDir, "cli.js");
  writeFileSync(script, "");
  const importMetaUrl = pathToFileURL(script).href; // what Node actually gives the module
  expect(isMainModule(importMetaUrl, script)).toBe(true);
});

test("isMainModule is false when the script is imported, not run directly", () => {
  const script = join(spacedDir, "cli.js");
  writeFileSync(script, "");
  const importMetaUrl = pathToFileURL(join(spacedDir, "other.js")).href;
  expect(isMainModule(importMetaUrl, script)).toBe(false);
});

test("usage errors still exit with code 2", async () => {
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await expect(run(["node", "cli", "inspect"])).resolves.toBe(2);
  } finally {
    write.mockRestore();
  }
});
