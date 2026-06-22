#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
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
    .name("pkgvet")
    .description("Inspect an npm package before you run or install it.")
    .exitOverride() // throw instead of calling process.exit, so we own exit codes
    .showHelpAfterError(true);

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
          try {
            const { llmOpinion } = await import("./llm.js");
            const note = await llmOpinion(verdict);
            if (note) process.stdout.write(`  llm: ${note}\n`);
          } catch {
            // opt-in second opinion is strictly additive; never let its failure
            // change the exit code, the verdict, or the core output.
          }
        }
        if (opts.failOn) {
          const threshold = (["low", "med", "high"].includes(opts.failOn) ? opts.failOn : "high") as RiskLevel;
          exitCode = levelMeetsThreshold(verdict.risk.level, threshold) ? 1 : 0;
        }
      } catch (err) {
        process.stderr.write(`pkgvet: ${(err as Error).message}\n`);
        exitCode = 2;
      }
    });

  try {
    await program.parseAsync(argv);
  } catch (err) {
    const code = (err as { code?: string }).code;
    return code === "commander.helpDisplayed" ? 0 : 2;
  }
  return exitCode;
}

// True when this module is the program entry point (run directly), false when
// imported (e.g. by tests). Build the comparison URL with pathToFileURL so it
// percent-encodes exactly like import.meta.url — a hand-built `file://${path}`
// string does NOT encode spaces/special chars, so any install path containing
// one would silently fail to match and the CLI would exit 0 printing nothing.
export function isMainModule(importMetaUrl: string, scriptPath: string): boolean {
  return importMetaUrl === pathToFileURL(realpathSync(scriptPath)).href;
}

// Use realpath (inside isMainModule) so it works through npx/npm symlinks.
if (process.argv[1] && isMainModule(import.meta.url, process.argv[1])) {
  run(process.argv).then((code) => process.exit(code));
}
