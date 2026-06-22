import { resolve } from "./resolver.js";
import { fetchPackage } from "./fetcher.js";
import { manifestSignal } from "./signals/manifest.js";
import { publisherSignal } from "./signals/publisher.js";
import { typosquatSignal } from "./signals/typosquat.js";
import { capabilitiesSignal } from "./signals/capabilities.js";
import { score } from "./scorer.js";
import type { Capability, Finding, PackageContext, Verdict } from "./types.js";

export async function analyze(spec: string): Promise<Verdict> {
  const meta = await resolve(spec);
  const fetched = await fetchPackage(`${meta.name}@${meta.version}`);

  const ctx: PackageContext = {
    name: meta.name,
    version: meta.version,
    sizeBytes: fetched.sizeBytes,
    publishedAt: meta.publishedAt,
    deprecated: meta.deprecated,
    manifest: fetched.manifest,
    dir: fetched.dir,
  };

  const findings: Finding[] = [
    ...manifestSignal(ctx),
    ...publisherSignal(ctx),
    ...typosquatSignal(ctx.name),
    ...capabilitiesSignal(ctx.dir),
  ];

  const capabilities = [
    ...new Set(
      findings
        .map((f) => f.capability)
        .filter((c): c is Capability => Boolean(c) && c !== "obfuscated"),
    ),
  ];

  return {
    package: {
      name: meta.name,
      version: meta.version,
      sizeBytes: fetched.sizeBytes,
      publishedAt: meta.publishedAt,
      publisher: ctx.publisher,
    },
    capabilities,
    findings,
    risk: score(findings),
  };
}
