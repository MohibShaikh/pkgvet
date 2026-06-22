import type { Verdict } from "../types.js";

export function renderHuman(v: Verdict): string {
  const p = v.package;
  const lines: string[] = [];
  lines.push(`─ ${p.name}@${p.version}`);
  if (v.capabilities.length > 0) {
    lines.push(`  permissions: ${v.capabilities.join(" · ")}`);
  } else {
    lines.push("  permissions: (none detected)");
  }
  lines.push(`  risk: ${v.risk.level.toUpperCase()} (${v.risk.score}/100)`);
  for (const f of v.findings) {
    lines.push(`  • ${f.reason}`);
  }
  return lines.join("\n");
}
