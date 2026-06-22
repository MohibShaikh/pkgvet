# pkgcheck

> Working name — subject to change.

A pre-flight inspector for npm packages. It checks a package **before** you run or install
it: downloads the package, statically reads the code **without executing it**, and tells you
how risky it looks and what it can touch.

`npm`/`npx` show you a version number and an "is it okay to proceed?" prompt with no real
information. `pkgcheck` replaces that blind moment with an actual answer — for a human at a
terminal, and for an AI agent about to run an `npx` command.

## What it looks like

> Illustrative — the engine is under construction. Output shape is what we're building toward.

```text
$ pkgcheck inspect left-pad
─ left-pad@1.3.0 · 6 kB · published 6y ago by stamat
  ✓ no install scripts   ✓ not obfuscated   ✓ exact name match
  permissions: fs:read
  risk: LOW (8/100)

$ pkgcheck inspect is0dd
─ is0dd@1.0.0 · 4 kB · published 2h ago by a-new-name
  ✗ postinstall script      ✗ obfuscated source
  ✗ looks like a typo of "is-odd" (very popular)
  permissions: fs:read · net · shell · env
  risk: HIGH (91/100)
  why: brand-new publisher + install script reaching the network and reading env
       is the classic credential-exfiltration shape. Do not run.
```

## Status

Working. The analysis engine is implemented: it resolves and downloads a package, statically
inspects it without executing it, and prints a calibrated risk verdict.

## Usage

```sh
npm install        # install dependencies
npm run build      # compile to dist/

node dist/cli.js inspect lodash                 # readable report
node dist/cli.js inspect lodash --json          # the same verdict as data, for agents/scripts
node dist/cli.js inspect is0dd --fail-on high   # exits non-zero if risk is too high (for CI/agents)
node dist/cli.js inspect foo --llm              # opt-in second opinion using YOUR OWN api key
```

The `--llm` flag is strictly opt-in and additive: it only appends a one-line second opinion to
the human report when `ANTHROPIC_API_KEY` is set. It never changes the deterministic score,
the verdict, or the exit code, and the tool works fully without it.

## What it checks

- **Paperwork:** install/lifecycle scripts, publisher & release recency, typosquat distance
  to popular names, deprecation, size/dependency anomalies.
- **Permissions (what the code can touch):** reads/writes files, network, runs shell
  commands, reads env/secrets, obfuscated source.

These combine into a conservative **risk score + level** with a plain-English "why."

## Principles

- **Never executes the package.** Static analysis only.
- **Works offline, free, and deterministic by default.** The `--llm` pass is strictly opt-in.
- **Calibrated against false positives.** A noisy tool gets uninstalled.

## License

MIT
