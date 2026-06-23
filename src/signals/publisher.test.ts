import { expect, test } from "vitest";
import { publisherSignal } from "./publisher.js";
import type { PackageContext } from "../types.js";

const NOW = new Date("2026-06-22T00:00:00Z");
const ctx = (over: Partial<PackageContext>): PackageContext => ({
  name: "x", version: "1.0.0", manifest: {}, dir: "/tmp/x", ...over,
});

test("a years-old release is not flagged", () => {
  const out = publisherSignal(ctx({ publishedAt: "2020-01-01T00:00:00Z" }), NOW);
  expect(out).toEqual([]);
});

test("a release from 2 hours ago is flagged as new, but only as a soft signal", () => {
  // Recency is contextual, not damning: routine new versions of trusted
  // packages (lodash, @types/node) are published constantly. The weight must
  // stay low enough that newness alone can't flip an otherwise-low package.
  const out = publisherSignal(ctx({ publishedAt: "2026-06-21T22:00:00Z" }), NOW);
  expect(out.find((f) => f.id === "new-release")?.weight).toBe(8);
});

test("missing publish date -> no finding", () => {
  expect(publisherSignal(ctx({}), NOW)).toEqual([]);
});
