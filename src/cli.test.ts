import { expect, test, vi } from "vitest";
import { levelMeetsThreshold, run } from "./cli.js";

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
