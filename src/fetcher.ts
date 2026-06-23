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
const MAX_TARBALL_BYTES = 100 * 1024 * 1024; // compressed download cap
const MAX_EXTRACTED_BYTES = 300 * 1024 * 1024; // unpacked cap (decompression-bomb guard)
const MAX_FILES = 20_000; // entry-count cap

// Only download tarballs from the npm registry over HTTPS. A package's
// `dist.tarball` can technically be any URL; without this, a crafted package
// could point us at an internal address (cloud metadata, localhost) — SSRF,
// which matters the moment this engine runs server-side.
export function isAllowedTarballUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname;
  return host === "registry.npmjs.org" || host.endsWith(".npmjs.org") || host.endsWith(".npmjs.com");
}

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

export function extractTarball(
  gzBuffer: Buffer,
  dir: string,
  opts: { maxBytes?: number; maxFiles?: number } = {},
): Promise<void> {
  const maxBytes = opts.maxBytes ?? MAX_EXTRACTED_BYTES;
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  return new Promise((resolveP, reject) => {
    let totalBytes = 0;
    let fileCount = 0;
    let exceeded = false;
    const stream = extract({
      cwd: dir,
      strip: 1, // npm tarballs nest everything under "package/"
      gzip: true,
      // Belt-and-suspenders: reject traversal paths, refuse symlinks/hardlinks
      // entirely (the vector behind every node-tar traversal advisory), and cap
      // total size + file count so a decompression bomb can't fill the disk.
      filter: (path, entry) => {
        const type = (entry as { type?: string }).type;
        if (isUnsafeEntryPath(path) || type === "SymbolicLink" || type === "Link") return false;
        if (type === "File") {
          fileCount += 1;
          totalBytes += (entry as { size?: number }).size ?? 0;
          if (fileCount > maxFiles || totalBytes > maxBytes) {
            exceeded = true;
            return false;
          }
        }
        return true;
      },
      onwarn: () => {}, // don't pollute output with benign tar warnings
    });
    stream.on("error", reject);
    stream.on("finish", () =>
      exceeded
        ? reject(new FetchError("package exceeds size/file-count limits"))
        : resolveP(),
    );
    stream.end(gzBuffer);
  });
}

// Download a tarball by URL and unpack it into an isolated temp dir. Never runs
// any code or lifecycle scripts; extraction is guarded against path traversal.
export async function fetchPackage(tarballUrl: string, integrity?: string): Promise<FetchedPackage> {
  if (!isAllowedTarballUrl(tarballUrl)) {
    throw new FetchError(`refusing to download tarball from a disallowed URL: ${tarballUrl}`);
  }
  let body: Buffer;
  try {
    const res = await fetch(tarballUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new FetchError(`could not download tarball: ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_TARBALL_BYTES) {
      throw new FetchError(`tarball too large: ${declared} bytes`);
    }
    body = Buffer.from(await res.arrayBuffer());
    if (body.byteLength > MAX_TARBALL_BYTES) {
      throw new FetchError(`tarball too large: ${body.byteLength} bytes`);
    }
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
