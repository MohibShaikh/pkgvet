import semver from "semver";

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 30_000;

export interface ResolvedMeta {
  name: string;
  version: string;
  publishedAt?: string;
  deprecated?: boolean;
  tarball: string;
  integrity?: string;
  publisher?: string;
  repository?: string;
}

// Split a spec into package name and version/range/tag, accounting for the
// leading "@" of scoped names (which is NOT a version separator).
export function parseSpec(spec: string): { name: string; range: string } {
  const at = spec.lastIndexOf("@");
  if (at > 0) return { name: spec.slice(0, at), range: spec.slice(at + 1) };
  return { name: spec, range: "" };
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

interface VersionManifest {
  name?: string;
  version?: string;
  dist?: { tarball?: string; integrity?: string };
  deprecated?: unknown;
  repository?: unknown;
  _npmUser?: NpmUser;
}

interface Packument {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, VersionManifest>;
  time?: Record<string, string>;
}

// Pick the concrete version a spec's range/tag/exact resolves to.
function selectVersion(packument: Packument, range: string): string | undefined {
  const versions = packument.versions ?? {};
  const tags = packument["dist-tags"] ?? {};
  if (!range) return tags.latest;
  if (tags[range]) return tags[range]; // dist-tag (latest, next, ...)
  if (versions[range]) return range; // exact version
  return semver.maxSatisfying(Object.keys(versions), range) ?? undefined; // range
}

export async function resolve(spec: string): Promise<ResolvedMeta> {
  const { name, range } = parseSpec(spec);

  let packument: Packument;
  try {
    // Scoped names ("@scope/pkg") encode the slash; the registry's full
    // packument (default Accept) carries time + per-version publisher metadata.
    const res = await fetch(`${REGISTRY}/${name.replace(/\//g, "%2F")}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) {
      throw new ResolveError(`could not resolve "${spec}": 404 Not Found`);
    }
    if (!res.ok) {
      throw new ResolveError(`could not resolve "${spec}": registry returned ${res.status}`);
    }
    packument = (await res.json()) as Packument;
  } catch (err) {
    if (err instanceof ResolveError) throw err;
    throw new ResolveError(`could not resolve "${spec}": ${(err as Error).message}`, { cause: err });
  }

  const version = selectVersion(packument, range);
  const manifest = version ? packument.versions?.[version] : undefined;
  if (!version || !manifest) {
    throw new ResolveError(`could not resolve "${spec}" to a published version`);
  }

  const tarball = manifest.dist?.tarball;
  if (!tarball) {
    throw new ResolveError(`resolved "${spec}" but it has no tarball URL`);
  }

  return {
    name: manifest.name ?? name,
    version,
    publishedAt: packument.time?.[version],
    deprecated: Boolean(manifest.deprecated),
    tarball,
    integrity: manifest.dist?.integrity,
    publisher: manifest._npmUser?.name,
    repository: normalizeRepoUrl(manifest.repository),
  };
}
