# pkgvet

A pre-flight inspector for npm packages. Downloads and statically analyzes a package
**without executing any code**, then reports what it can touch and how risky it looks.

## Usage

```sh
# Install
npm install -g pkgvet

# Inspect a package
pkgvet inspect <package-spec>

# Or with npx (no install needed)
npx pkgvet inspect <package-spec>
```

### Examples

```sh
# Human-readable report
pkgvet inspect shelljs@0.8.5

# JSON output for scripts/agents
pkgvet inspect shelljs --json

# Fail CI if risk level meets a threshold (exit 1)
pkgvet inspect is0dd --fail-on med

# Opt-in LLM second opinion (requires API key)
pkgvet inspect shelljs --llm
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean — risk is below threshold (or no threshold set) |
| `1` | Risk meets or exceeds `--fail-on` threshold |
| `2` | Resolution / download / parse failure (never treated as safe) |

## What it checks

The tool runs four static analysis passes on the unpacked package:

| Signal | What it looks for |
|---|---|
| **Manifest** | `preinstall`/`install`/`postinstall` scripts, `deprecated` flag |
| **Publisher** | Version published within last 7 days (new accounts are a risk signal) |
| **Typosquat** | Levenshtein + homoglyph distance to 20 popular package names |
| **Capabilities** | AST + regex scan of `.js`/`.ts`/`.cjs`/`.mjs` files for patterns indicating: `fs:read`, `fs:write`, `net`, `shell`, `env`, `obfuscated` |

Each finding has a weight. The scorer combines them into a 0–100 score and a
`low` / `med` / `high` level, with a bonus for dangerous combinations (e.g.
install script + network + env reads = classic credential exfil shape).

## --llm (second opinion)

Strictly opt-in. Set one of these environment variables:

| Env var | Provider | Model | Cost |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic | `claude-opus-4-8` | Paid |
| `OPENAI_API_KEY` | OpenAI | `gpt-5.5` | Paid |
| `GROQ_API_KEY` | Groq | `llama-3.3-70b-versatile` | Free |
| `GEMINI_API_KEY` | Gemini | `gemini-2.0-flash` | Free |

The tool sends only the package name, version, risk level, and detected
capabilities (no source code). Each call is capped at 100 output tokens with
a 15-second timeout. A failing or missing API key is silently ignored — it
never changes the deterministic score, verdict, or exit code.

## Principles

- **Never executes the package.** Static analysis only.
- **Offline, free, and deterministic by default.** The `--llm` pass is opt-in.
- **Conservative weighting.** A benign library that only reads files stays `LOW`.
  Risk is driven by dangerous *combinations*, not single capabilities.

## Install

```sh
npm install -g pkgvet
npm run build    # compile TypeScript to dist/
```

Requires Node >= 18.

## License

MIT
