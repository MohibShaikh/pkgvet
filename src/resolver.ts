import pacote from "pacote";

export interface ResolvedMeta {
  name: string;
  version: string;
  publishedAt?: string;
  deprecated?: boolean;
  tarball: string;
  publisher?: string;
  repository?: string;
}

const HOSTS: Record<string, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
};

// Turn the many package.json `repository` shapes (string, {url}, git+ssh, the
// "github:user/repo" shorthand) into a single browsable https URL, or undefined
// when there's no usable public link — the "is it open source?" signal.
export function normalizeRepoUrl(repo: unknown): string | undefined {
  let raw: string | undefined;
  if (typeof repo === "string") raw = repo;
  else if (repo && typeof repo === "object" && typeof (repo as { url?: unknown }).url === "string") {
    raw = (repo as { url: string }).url;
  }
  if (!raw) return undefined;
  raw = raw.trim();

  const shorthand = raw.match(/^(github|gitlab|bitbucket):(.+)$/);
  if (shorthand) {
    return `https://${HOSTS[shorthand[1]]}/${shorthand[2].replace(/\.git$/, "")}`;
  }

  raw = raw
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/");

  return /^https?:\/\//.test(raw) ? raw : undefined;
}

export class ResolveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResolveError";
  }
}

interface NpmUser {
  name?: string;
}

interface ResolvedManifest {
  name: string;
  version: string;
  dist?: { tarball?: string };
  deprecated?: unknown;
  repository?: unknown;
  _npmUser?: NpmUser;
}

export async function resolve(spec: string): Promise<ResolvedMeta> {
  let manifest: ResolvedManifest;
  try {
    manifest = (await pacote.manifest(spec, { fullMetadata: true })) as ResolvedManifest;
  } catch (err) {
    throw new ResolveError(`could not resolve "${spec}": ${(err as Error).message}`, { cause: err });
  }

  let publishedAt: string | undefined;
  let publisher = manifest._npmUser?.name;
  try {
    const packument = await pacote.packument(manifest.name, { fullMetadata: true });
    publishedAt = (packument.time as Record<string, string> | undefined)?.[manifest.version];
    // The packument's per-version record is the authoritative source for who
    // actually published this version, if the manifest didn't carry it.
    const versions = packument.versions as Record<string, { _npmUser?: NpmUser }> | undefined;
    publisher = publisher ?? versions?.[manifest.version]?._npmUser?.name;
  } catch {
    // metadata best-effort; absence is handled downstream
  }

  const tarball = manifest.dist?.tarball;
  if (!tarball) {
    throw new ResolveError(`resolved "${spec}" but it has no tarball URL`);
  }

  return {
    name: manifest.name,
    version: manifest.version,
    publishedAt,
    deprecated: Boolean(manifest.deprecated),
    tarball,
    publisher,
    repository: normalizeRepoUrl(manifest.repository),
  };
}
