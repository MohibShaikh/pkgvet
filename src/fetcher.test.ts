import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { create } from "tar";
import { extractTarball, fetchPackage, FetchError, dirSize, isUnsafeEntryPath, verifyIntegrity } from "./fetcher.js";
import { resolve } from "./resolver.js";

test("extraction refuses a tarball entry that escapes the target dir (zip-slip)", async () => {
  // Build a genuinely malicious tarball whose entry path is "../<sentinel>" —
  // a naive extractor would write it ABOVE the target dir, into tmpdir.
  const sentinel = `zipslip-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`;
  const packRoot = mkdtempSync(join(tmpdir(), "pkgcheck-evil-"));
  writeFileSync(join(packRoot, sentinel), "pwned"); // the payload, one level up from cwd
  const sub = join(packRoot, "sub");
  mkdirSync(sub);
  const tgz = join(packRoot, "evil.tgz");
  // preservePaths lets us pack the literal "../<sentinel>" path into the archive.
  await create({ gzip: true, cwd: sub, file: tgz, preservePaths: true }, [`../${sentinel}`]);
  const malicious = readFileSync(tgz);
  rmSync(packRoot, { recursive: true, force: true }); // only the buffer remains

  const target = mkdtempSync(join(tmpdir(), "pkgcheck-target-"));
  const escapeLanding = join(tmpdir(), sentinel); // where an unguarded extractor would write
  try {
    await extractTarball(malicious, target);
    expect(existsSync(escapeLanding)).toBe(false); // nothing escaped above the target
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(escapeLanding, { force: true }); // clean up if the guard had failed
  }
}, 30000);

test("isUnsafeEntryPath rejects traversal and absolute paths (zip-slip guard)", () => {
  expect(isUnsafeEntryPath("../escape")).toBe(true);
  expect(isUnsafeEntryPath("a/../../b")).toBe(true);
  expect(isUnsafeEntryPath("/etc/passwd")).toBe(true);
  expect(isUnsafeEntryPath("")).toBe(true);
  expect(isUnsafeEntryPath("package/index.js")).toBe(false);
  expect(isUnsafeEntryPath("normal/path.js")).toBe(false);
});

test("verifyIntegrity passes a matching sha512 and throws on a mismatch", () => {
  const buf = Buffer.from("hello pkgvet");
  const good = `sha512-${createHash("sha512").update(buf).digest("base64")}`;
  expect(() => verifyIntegrity(buf, good)).not.toThrow();
  expect(() => verifyIntegrity(buf, "sha512-AAAAobviouslywrong==")).toThrow(FetchError);
});

test("extracts a real package and reads its manifest", async () => {
  const meta = await resolve("left-pad@1.3.0");
  const out = await fetchPackage(meta.tarball, meta.integrity);
  try {
    expect(existsSync(join(out.dir, "package.json"))).toBe(true);
    expect(out.manifest.name).toBe("left-pad");
    expect(out.sizeBytes).toBeGreaterThan(0);
  } finally {
    rmSync(out.dir, { recursive: true, force: true });
  }
}, 30000);

test("throws FetchError for an unreachable tarball URL", async () => {
  await expect(
    fetchPackage("https://registry.npmjs.org/this-pkg/-/this-pkg-9.9.9.tgz"),
  ).rejects.toBeInstanceOf(FetchError);
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
