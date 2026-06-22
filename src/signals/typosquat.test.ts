import { expect, test } from "vitest";
import { typosquatSignal } from "./typosquat.js";

test("a popular name itself is not flagged", () => {
  expect(typosquatSignal("is-odd")).toEqual([]);
});

test("a one-edit lookalike of a popular name is flagged", () => {
  const findings = typosquatSignal("is0dd");
  expect(findings).toHaveLength(1);
  expect(findings[0].id).toBe("typosquat");
  expect(findings[0].reason).toContain("is-odd");
});

test("an unrelated name is not flagged", () => {
  expect(typosquatSignal("my-very-unique-pkg-name")).toEqual([]);
});
