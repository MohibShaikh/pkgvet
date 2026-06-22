# pkgcheck

> Working name — subject to change.

A pre-flight inspector for npm packages. It checks a package **before** you run or install
it: downloads the package, statically reads the code **without executing it**, and tells you
how risky it looks and what it can touch.

`npm`/`npx` show you a version number and an "is it okay to proceed?" prompt with no real
information. `pkgcheck` replaces that blind moment with an actual answer — for a human at a
terminal, and for an AI agent about to run an `npx` command.

## Status

Early. Scaffold only — the analysis engine is being built against an approved design.

## Planned usage

```sh
pkgcheck inspect lodash                 # readable report
pkgcheck inspect lodash --json          # the same verdict as data, for agents/scripts
pkgcheck inspect is0dd --fail-on high   # exits non-zero if risk is too high (for CI/agents)
pkgcheck inspect foo --llm              # opt-in second opinion using YOUR OWN api key
```

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
