import type { Finding, PackageContext } from "../types.js";

const LIFECYCLE = ["preinstall", "install", "postinstall"] as const;

export function manifestSignal(ctx: PackageContext): Finding[] {
  const findings: Finding[] = [];
  const scripts = (ctx.manifest.scripts ?? {}) as Record<string, unknown>;

  const present = LIFECYCLE.filter((k) => typeof scripts[k] === "string");
  if (present.length > 0) {
    findings.push({
      id: "install-script",
      weight: 25,
      reason: `runs code automatically on install (${present.join(", ")})`,
    });
  }

  if (ctx.deprecated) {
    findings.push({ id: "deprecated", weight: 5, reason: "package is deprecated" });
  }

  return findings;
}
