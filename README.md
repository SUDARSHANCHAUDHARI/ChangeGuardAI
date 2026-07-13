# ChangeGuard AI

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/SUDARSHANCHAUDHARI/ChangeGuardAI?sort=semver)](https://github.com/SUDARSHANCHAUDHARI/ChangeGuardAI/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Analyze Git changes — branches, commits, working trees, patches, or GitHub pull
requests — and get a deterministic report of **what changed, what it affects,
what could break, whether tests were added, and a risk score**.

ChangeGuard runs **fully locally**. There is no hosted backend, no account, and
no telemetry. Deterministic rules do the core work; an AI provider (Ollama or
any OpenAI-compatible server) is **optional** and off by default.

> Status: v0.1 — deterministic analysis, 42 rules, risk scoring, test-plan
> generation, read-only GitHub PR support, and an optional local AI layer.

## What it does

1. **What changed** — added / modified / deleted / renamed files, classified by
   type (source, test, auth, API, migration, dependency, CI, config, docs, …).
2. **What it affects** — affected areas derived from file classification.
3. **What could break** — deterministic findings with evidence, severity, and a
   recommendation. Never a finding without evidence.
4. **Test gaps** — flags source/auth/API/migration changes lacking tests.
5. **Risk** — a deterministic 0–100 score with a full point breakdown.
6. **Test plan** — a structured, prioritized set of scenarios to run before merge.

## Installation

Requires **Node.js 20+** and **pnpm**.

```bash
git clone <this-repo> changeguard-ai
cd changeguard-ai
pnpm install
pnpm build
# run the built CLI directly
node apps/cli/dist/index.js --help
```

### Make `changeguard` a bare command

Until it's published to npm, link the built binary onto your `PATH`:

```bash
# option A — pnpm global link (run `pnpm setup` once if prompted)
cd apps/cli && pnpm link --global

# option B — npm global link
cd apps/cli && npm link

# option C — symlink into any PATH dir you own (no profile changes)
ln -sf "$PWD/apps/cli/dist/index.js" ~/bin/changeguard   # or ~/.local/bin
```

Then `changeguard --help` works from any repository. Publishing to npm (so
`npm i -g changeguard` works out of the box) is on the roadmap.

## Quick start

```bash
# in your project, from a feature branch:
changeguard init                       # scaffold config, ignore .changeguard/
changeguard analyze --base main --no-ai
```

This compares `main...HEAD` (i.e. `git diff main...HEAD`), writes reports to
`.changeguard/`, prints a summary, and exits non-zero if risk crosses your
threshold.

## CLI commands

| Command | Purpose |
| --- | --- |
| `changeguard init` | Scaffold `changeguard.config.ts` and ignore `.changeguard/` |
| `changeguard inspect` | Detect repository metadata (stack, frameworks, CI, GitHub) |
| `changeguard diff` | Collect and classify changed files (no scoring) |
| `changeguard analyze` | Full analysis + reports + exit code |
| `changeguard risk` | Print only the deterministic risk score/breakdown |
| `changeguard test-plan` | Generate the deterministic test plan |
| `changeguard report` | Write the full report set to `.changeguard/` |
| `changeguard review` | Analyze a GitHub PR and produce a review comment (dry run by default; `--post` publishes one sticky comment) |
| `changeguard rules list` | List all built-in rules |
| `changeguard rules test` | Run rules against the current diff (authoring/debug) |

### Selecting what to analyze

```bash
changeguard analyze --base main
changeguard analyze --base main --head feature/login
changeguard analyze --commits abc123..def456
changeguard analyze --diff ./change.patch
changeguard analyze --pr 123            # read-only GitHub PR (needs GITHUB_TOKEN)
changeguard review --pr 123             # print the PR review comment (dry run)
changeguard review --pr 123 --post      # publish/update one sticky PR comment
changeguard analyze --staged            # staged changes
changeguard analyze --working           # working tree vs HEAD
```

### Output options

```bash
changeguard analyze --format markdown   # or json, or human (default)
changeguard analyze --no-ai             # deterministic rules only
changeguard analyze --fail-on high      # exit 2 when risk >= high
```

Default comparison is `git diff <baseBranch>...HEAD`. The base branch is
configurable (`baseBranch`, default `main`).

## Generated output

Written to `.changeguard/` (git-ignored by `changeguard init`):

```
.changeguard/
├── report.md            # human-readable report
├── report.json          # full AnalysisResult
├── findings.json        # findings only
├── test-plan.md         # recommended test plan
├── changed-files.json   # classified changed files
└── analysis-context.json
```

## Example report

```markdown
# ChangeGuard AI Report

Risk: High — 68/100

Recommendation: Request changes

## Risk Breakdown

| Points | Reason | Source |
| ---: | --- | --- |
| +36 | 2 high findings | findings |
| +20 | Authorization-related file changed | files |
| +15 | Source changed without related tests | findings |
```

## Configuration

Create `changeguard.config.ts` (see `changeguard.config.example.ts`):

```ts
import { defineConfig } from "@changeguard/core";

export default defineConfig({
  baseBranch: "main",
  exclude: ["**/dist/**", "**/*.snap"],
  sensitivePaths: [
    { pattern: "src/auth/**", risk: 20, category: "authentication" }
  ],
  risk: { warnThreshold: 40, failThreshold: 70 },
  ai: { enabled: false, provider: "ollama", minimumConfidence: 0.7 }
});
```

Precedence: `changeguard.config.ts` → `.js` → `.mjs` → `.changeguardrc.json` →
`package.json` `changeguard` field → built-in defaults. Full reference:
[`docs/configuration.md`](docs/configuration.md).

## Using Ollama

```bash
export CHANGEGUARD_PROVIDER=ollama
export CHANGEGUARD_MODEL=qwen3:14b
export CHANGEGUARD_BASE_URL=http://localhost:11434
# set ai.enabled: true in your config, then:
changeguard analyze --base main
```

## Using an OpenAI-compatible provider

```bash
export CHANGEGUARD_PROVIDER=openai
export CHANGEGUARD_MODEL=gpt-4o-mini
export CHANGEGUARD_BASE_URL=https://api.openai.com
export CHANGEGUARD_API_KEY=sk-...
```

Works with OpenAI, LM Studio, vLLM, LiteLLM, and similar. See
[`docs/ai-providers.md`](docs/ai-providers.md).

## Running in GitHub Actions

See [`examples/github-action/`](examples/github-action/) for a ready-to-use
workflow that analyzes each PR, uploads the reports as an artifact, and fails
the check on high risk.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Analysis completed; threshold not exceeded |
| `1` | Internal analysis error |
| `2` | Configured risk threshold exceeded |
| `3` | Critical security finding present |
| `4` | Invalid configuration |

## Current limitations

- Rules are **textual diff heuristics**, not AST or call-graph analysis. Each
  rule documents its own limitations (`changeguard rules list`). ChangeGuard
  deliberately prefers false negatives over noisy false positives.
- Untracked files are not included in working-tree diffs.
- GitHub is **read-only for analysis**. The only write is `changeguard review
  --post`, which upserts a single sticky PR comment on explicit request (no
  reviews, labels, or status checks).
- Tree-sitter is abstracted but not bundled; the MVP works without it.

## Roadmap

- Publish `changeguard` to npm.
- SARIF output.
- Optional Tree-sitter-backed symbol context.
- GitHub PR comment/summary writing (opt-in).
- More language-specific rules.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/architecture.md`](docs/architecture.md).

## Author

Built by **Sudarshan Chaudhari** ([@SUDARSHANCHAUDHARI](https://github.com/SUDARSHANCHAUDHARI)) — SudarshanTechLabs.

Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT © 2026 Sudarshan Chaudhari (SudarshanTechLabs) — see [LICENSE](LICENSE).
