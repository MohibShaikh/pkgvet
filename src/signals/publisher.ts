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
        weight: 15,
        reason: "this version was published very recently (< 7 days ago)",
      },
    ];
  }
  return [];
}
