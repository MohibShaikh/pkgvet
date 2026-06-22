import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fetchPackage, FetchError } from "./fetcher.js";

test("extracts a real package and reads its manifest", async () => {
  const out = await fetchPackage("left-pad@1.3.0");
  expect(existsSync(join(out.dir, "package.json"))).toBe(true);
  expect(out.manifest.name).toBe("left-pad");
  expect(out.sizeBytes).toBeGreaterThan(0);
}, 30000);

test("throws FetchError for a non-existent package", async () => {
  await expect(fetchPackage("this-pkg-should-never-exist-pkgcheck-xyz")).rejects.toBeInstanceOf(FetchError);
}, 30000);
