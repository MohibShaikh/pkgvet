import { expect, test } from "vitest";
import { manifestSignal } from "./manifest.js";
import type { PackageContext } from "../types.js";

const ctx = (over: Partial<PackageContext>): PackageContext => ({
  name: "x", version: "1.0.0", manifest: {}, dir: "/tmp/x", ...over,
});

test("no lifecycle scripts -> no install-script finding", () => {
  const out = manifestSignal(ctx({ manifest: { scripts: { test: "vitest" } } }));
  expect(out.find((f) => f.id === "install-script")).toBeUndefined();
});

test("a postinstall script is flagged", () => {
  const out = manifestSignal(ctx({ manifest: { scripts: { postinstall: "node x.js" } } }));
  expect(out.find((f) => f.id === "install-script")?.weight).toBe(25);
});

test("deprecated package is flagged", () => {
  const out = manifestSignal(ctx({ deprecated: true }));
  expect(out.find((f) => f.id === "deprecated")).toBeDefined();
});
