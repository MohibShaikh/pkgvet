#!/usr/bin/env node
import { Command } from "commander";
import { analyze } from "./analyze.js";
import { renderHuman } from "./reporters/human.js";
import { renderJson } from "./reporters/json.js";
import type { RiskLevel } from "./types.js";

const ORDER: Record<RiskLevel, number> = { low: 0, med: 1, high: 2 };

export function levelMeetsThreshold(level: RiskLevel, threshold: RiskLevel): boolean {
  return ORDER[level] >= ORDER[threshold];
}

export async function run(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name("pkgcheck")
    .description("Inspect an npm package before you run or install it.")
    .exitOverride(); // throw instead of calling process.exit, so we own exit codes

  let exitCode = 0;

  program
    .command("inspect")
    .argument("<pkg>", "package spec, e.g. lodash or lodash@4.17.21")
    .option("--json", "output the verdict as JSON")
    .option("--fail-on <level>", "exit non-zero if risk >= level (low|med|high)")
    .option("--llm", "opt-in second opinion using your own API key")
    .action(async (pkg: string, opts: { json?: boolean; failOn?: string; llm?: boolean }) => {
      try {
        const verdict = await analyze(pkg);
        process.stdout.write((opts.json ? renderJson(verdict) : renderHuman(verdict)) + "\n");
        if (opts.llm && !opts.json) {
          const { llmOpinion } = await import("./llm.js");
          const note = await llmOpinion(verdict);
          if (note) process.stdout.write(`  llm: ${note}\n`);
        }
        if (opts.failOn) {
          const threshold = (["low", "med", "high"].includes(opts.failOn) ? opts.failOn : "high") as RiskLevel;
          exitCode = levelMeetsThreshold(verdict.risk.level, threshold) ? 1 : 0;
        }
      } catch (err) {
        process.stderr.write(`pkgcheck: ${(err as Error).message}\n`);
        exitCode = 2;
      }
    });

  try {
    await program.parseAsync(argv);
  } catch {
    return 2; // commander usage error
  }
  return exitCode;
}

// Execute only when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv).then((code) => process.exit(code));
}
