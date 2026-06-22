import { expect, test } from "vitest";
import { score } from "./scorer.js";
import type { Finding } from "./types.js";

const f = (id: string, weight: number, capability?: Finding["capability"]): Finding =>
  ({ id, weight, reason: id, capability });

test("no findings is clean", () => {
  expect(score([])).toEqual({ score: 0, level: "low" });
});

test("a benign fs:read-only library stays low", () => {
  expect(score([f("cap:fs:read", 2, "fs:read")]).level).toBe("low");
});

test("score is clamped to 0..100", () => {
  expect(score([f("a", 500)]).score).toBe(100);
  expect(score([f("b", -10)]).score).toBe(0);
});

test("the exfil combo (install-script + net + env) scores high", () => {
  const findings = [
    f("install-script", 25),
    f("cap:net", 8, "net"),
    f("cap:env", 10, "env"),
  ];
  expect(score(findings).level).toBe("high");
});

test("network alone is not high", () => {
  expect(score([f("cap:net", 8, "net")]).level).toBe("low");
});
