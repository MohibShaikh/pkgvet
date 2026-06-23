import { expect, test } from "vitest";
import { renderJson } from "./json.js";
import { renderHuman } from "./human.js";
import type { Verdict } from "../types.js";

const verdict: Verdict = {
  package: { name: "is0dd", version: "1.0.0" },
  capabilities: ["fs:read", "net", "shell", "env"],
  findings: [{ id: "typosquat", weight: 30, reason: 'looks like a typo of "is-odd"' }],
  risk: { score: 91, level: "high" },
};

test("renderJson round-trips", () => {
  expect(JSON.parse(renderJson(verdict))).toEqual(verdict);
});

test("human report includes name, level, score, capability, and a reason", () => {
  const out = renderHuman(verdict);
  expect(out).toContain("is0dd@1.0.0");
  expect(out).toContain("HIGH");
  expect(out).toContain("91");
  expect(out).toContain("net");
  expect(out).toContain("is-odd");
});

test("human report shows the last publisher and the source repository when known", () => {
  const out = renderHuman({
    ...verdict,
    package: { ...verdict.package, publisher: "mohibzz", repository: "https://github.com/u/r" },
  });
  expect(out).toContain("mohibzz");
  expect(out).toContain("https://github.com/u/r");
});

test("human report flags when no public source repository is listed", () => {
  // "is it open source or not" is exactly the visibility Theo asked for: a
  // package with no public repo should say so, not stay silent.
  expect(renderHuman(verdict)).toMatch(/no public (source )?repository/i);
});
