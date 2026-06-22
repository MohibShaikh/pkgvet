import { expect, test } from "vitest";
import { levelMeetsThreshold } from "./cli.js";

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
