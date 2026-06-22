import pacote from "pacote";

export interface ResolvedMeta {
  name: string;
  version: string;
  publishedAt?: string;
  deprecated?: boolean;
  tarball: string;
}

export class ResolveError extends Error {}

export async function resolve(spec: string): Promise<ResolvedMeta> {
  let manifest: Awaited<ReturnType<typeof pacote.manifest>>;
  try {
    manifest = await pacote.manifest(spec, { fullMetadata: true });
  } catch (err) {
    throw new ResolveError(`could not resolve "${spec}": ${(err as Error).message}`);
  }

  let publishedAt: string | undefined;
  try {
    const packument = await pacote.packument(manifest.name, { fullMetadata: true });
    publishedAt = (packument.time as Record<string, string> | undefined)?.[manifest.version];
  } catch {
    // metadata best-effort; absence is handled downstream
  }

  return {
    name: manifest.name,
    version: manifest.version,
    publishedAt,
    deprecated: Boolean((manifest as { deprecated?: unknown }).deprecated),
    tarball: manifest.dist?.tarball ?? "",
  };
}
