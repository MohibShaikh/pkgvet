import { expect, test } from "vitest";
import { resolve, ResolveError } from "./resolver.js";

test("resolves a real pinned package", async () => {
  const meta = await resolve("left-pad@1.3.0");
  expect(meta.name).toBe("left-pad");
  expect(meta.version).toBe("1.3.0");
  expect(meta.tarball).toMatch(/^https?:\/\//);
}, 20000);

test("throws ResolveError for a non-existent package", async () => {
  await expect(resolve("this-pkg-should-never-exist-pkgcheck-xyz")).rejects.toBeInstanceOf(ResolveError);
}, 20000);
