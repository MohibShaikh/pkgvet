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

test("a fresh release of an otherwise-low-capability package is not flipped to med by recency", () => {
  // A routine new version of a normal package (net + env + fs, base 26 = low)
  // must not jump to med just because it was published recently (weight 8).
  const findings = [
    f("new-release", 8),
    f("cap:net", 8, "net"),
    f("cap:env", 10, "env"),
    f("cap:fs:read", 2, "fs:read"),
    f("cap:fs:write", 6, "fs:write"),
  ];
  expect(score(findings).level).toBe("low");
});
