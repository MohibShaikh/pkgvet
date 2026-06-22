import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fetchPackage, FetchError, dirSize } from "./fetcher.js";

test("extracts a real package and reads its manifest", async () => {
  const out = await fetchPackage("left-pad@1.3.0");
  try {
    expect(existsSync(join(out.dir, "package.json"))).toBe(true);
    expect(out.manifest.name).toBe("left-pad");
    expect(out.sizeBytes).toBeGreaterThan(0);
  } finally {
    rmSync(out.dir, { recursive: true, force: true });
  }
}, 30000);

test("throws FetchError for a non-existent package", async () => {
  await expect(fetchPackage("this-pkg-should-never-exist-pkgcheck-xyz")).rejects.toBeInstanceOf(FetchError);
}, 30000);

test("dirSize does not follow or fail on symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "pkgcheck-size-"));
  const outside = mkdtempSync(join(tmpdir(), "pkgcheck-size-outside-"));
  try {
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "file.txt"), "1234");
    writeFileSync(join(outside, "large.txt"), "x".repeat(1000));
    symlinkSync(join(outside, "large.txt"), join(root, "linked-large.txt"));
    symlinkSync(join(root, "missing.txt"), join(root, "dangling.txt"));

    expect(dirSize(root)).toBe(4);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
