import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pacote from "pacote";

export interface FetchedPackage {
  dir: string;
  manifest: Record<string, unknown>;
  sizeBytes: number;
}

export class FetchError extends Error {}

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

export async function fetchPackage(spec: string): Promise<FetchedPackage> {
  const dir = mkdtempSync(join(tmpdir(), "pkgcheck-pkg-"));
  try {
    // pacote.extract unpacks the tarball WITHOUT running any lifecycle scripts
    // and guards against path traversal in tar entries.
    await pacote.extract(spec, dir);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new FetchError(`could not fetch "${spec}": ${(err as Error).message}`);
  }

  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    // leave manifest empty; downstream signals tolerate it
  }

  return { dir, manifest, sizeBytes: dirSize(dir) };
}
