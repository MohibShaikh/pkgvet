import type { Finding, PackageContext } from "../types.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function publisherSignal(ctx: PackageContext, now: Date = new Date()): Finding[] {
  if (!ctx.publishedAt) return [];
  const published = new Date(ctx.publishedAt).getTime();
  if (Number.isNaN(published)) return [];

  const ageMs = now.getTime() - published;
  if (ageMs >= 0 && ageMs < SEVEN_DAYS_MS) {
    return [
      {
        id: "new-release",
        // Soft, contextual signal: trusted packages publish routine versions
        // constantly, so newness must not by itself flip a package's level.
        weight: 8,
        reason: "this version was published recently (< 7 days ago)",
      },
    ];
  }
  return [];
}
