import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { extract } from "tar";

export interface FetchedPackage {
  dir: string;
  manifest: Record<string, unknown>;
  sizeBytes: number;
}

export class FetchError extends Error {}

const TIMEOUT_MS = 30_000;

export function dirSize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = lstatSync(p);
    if (s.isDirectory()) total += dirSize(p);
    else if (s.isFile()) total += s.size;
  }
  return total;
}

// A tar entry path is unsafe if it is absolute or contains a ".." segment —
// the zip-slip shape. Defense-in-depth on top of node-tar's own protections.
export function isUnsafeEntryPath(p: string): boolean {
  if (!p) return true;
  if (isAbsolute(p)) return true;
  return p.split(/[\\/]+/).includes("..");
}

// Verify the downloaded bytes match the registry's Subresource Integrity hash.
// A mismatch means the tarball was tampered with in transit -> hard failure.
// An unparseable/unknown-algorithm hash is skipped (the bytes already came over
// HTTPS from the official registry; this is an extra layer, not the only one).
export function verifyIntegrity(buf: Buffer, integrity: string): void {
  const first = integrity.trim().split(/\s+/)[0] ?? "";
  const dash = first.indexOf("-");
  if (dash < 0) return;
  const algo = first.slice(0, dash);
  const expected = first.slice(dash + 1);
  let actual: string;
  try {
    actual = createHash(algo).update(buf).digest("base64");
  } catch {
    return; // unknown algorithm; can't verify, don't falsely fail
  }
  if (actual !== expected) {
    throw new FetchError("tarball integrity check failed (hash mismatch)");
  }
}

export function extractTarball(gzBuffer: Buffer, dir: string): Promise<void> {
  return new Promise((resolveP, reject) => {
    const stream = extract({
      cwd: dir,
      strip: 1, // npm tarballs nest everything under "package/"
      gzip: true,
      // Belt-and-suspenders: reject traversal paths and refuse symlinks /
      // hardlinks entirely. We only read source bytes, never need links — and
      // links are the vector behind every node-tar path-traversal advisory.
      filter: (path, entry) => {
        const type = (entry as { type?: string }).type;
        return !isUnsafeEntryPath(path) && type !== "SymbolicLink" && type !== "Link";
      },
      onwarn: () => {}, // don't pollute output with benign tar warnings
    });
    stream.on("error", reject);
    stream.on("finish", () => resolveP());
    stream.end(gzBuffer);
  });
}

// Download a tarball by URL and unpack it into an isolated temp dir. Never runs
// any code or lifecycle scripts; extraction is guarded against path traversal.
export async function fetchPackage(tarballUrl: string, integrity?: string): Promise<FetchedPackage> {
  let body: Buffer;
  try {
    const res = await fetch(tarballUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new FetchError(`could not download tarball: ${res.status}`);
    body = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(`could not download "${tarballUrl}": ${(err as Error).message}`);
  }

  if (integrity) verifyIntegrity(body, integrity);

  const dir = mkdtempSync(join(tmpdir(), "pkgcheck-pkg-"));
  try {
    await extractTarball(body, dir);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new FetchError(`could not extract tarball: ${(err as Error).message}`);
  }

  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    // leave manifest empty; downstream signals tolerate it
  }

  return { dir, manifest, sizeBytes: dirSize(dir) };
}
