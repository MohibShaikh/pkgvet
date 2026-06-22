import type { Capability, Finding, RiskLevel } from "./types.js";

function has(findings: Finding[], cap: Capability): boolean {
  return findings.some((f) => f.capability === cap);
}

function hasId(findings: Finding[], id: string): boolean {
  return findings.some((f) => f.id === id);
}

/**
 * Combine findings into a 0..100 score and a level.
 * Conservative: single capabilities contribute little; the dangerous
 * *combination* (code that runs on install OR shells out, AND reaches the
 * network, AND touches secrets or is a typosquat) gets a large bonus.
 */
export function score(findings: Finding[]): { score: number; level: RiskLevel } {
  const base = findings.reduce((sum, f) => sum + f.weight, 0);

  const runsCode = hasId(findings, "install-script") || has(findings, "shell");
  const reachesNet = has(findings, "net");
  const sensitive = has(findings, "env") || hasId(findings, "typosquat");
  const comboBonus = runsCode && reachesNet && sensitive ? 30 : 0;

  const raw = base + comboBonus;
  const clamped = Math.min(100, Math.max(0, raw));
  const level: RiskLevel = clamped >= 70 ? "high" : clamped >= 35 ? "med" : "low";
  return { score: clamped, level };
}
