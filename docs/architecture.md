# Architecture

ChangeGuard AI is a pnpm workspace with two packages:

```
apps/cli            # `changeguard` — Commander CLI, thin orchestration
packages/core       # @changeguard/core — all analysis logic
```

`core` is organized into internal folders that map 1:1 to the packages in the
original design. They are import-clean, so each can later be extracted into its
own workspace package without code changes:

```
packages/core/src/
├── types/         # domain types + Zod schemas
├── shared/        # errors, exit codes, logger, glob
├── config/        # schema, defineConfig, loader (ts/js/json/pkg field)
├── git/           # Git runner, diff parser, source resolution
├── analyzer/      # classification, inspection, normalization, dedupe, analyze()
├── rules/         # rule engine + rule sets (security/api/db/reliability/config/testing)
├── risk-engine/   # deterministic scoring
├── test-plan/     # deterministic test-plan generation
├── reporters/     # Markdown + JSON output
├── llm/           # optional AI provider abstraction
└── github/        # read-only GitHub PR fetch (Octokit)
```

## Pipeline

`analyze()` (in `analyzer/analyze.ts`) is the single entry point:

```
collect diff ─▶ normalize/classify ─▶ inspect repo ─▶ run rules
      │                                                    │
      │                                          (optional) AI findings
      │                                          validated against the diff
      ▼                                                    ▼
                       merge ─▶ dedupe ─▶ score risk ─▶ test plan ─▶ AnalysisResult
```

- **Diff sources** (`git/sources.ts`): base…head range, commit range, working
  tree, staged, patch file, or prefetched (GitHub PR). Git-backed sources shell
  out to native `git` via `execa`; patch and prefetched sources need no git.
- **Rules** run in isolation — a throwing rule is recorded and the rest continue.
- **AI is optional** and additive. A failed AI call never fails deterministic
  analysis unless `ai.required` is set. Deterministic findings always win dedup.

## Design decisions

- **Two packages, not nine.** The spec permits starting with fewer packages.
  The internal folder layout preserves every intended boundary; splitting later
  is a move + a `package.json`, not a refactor.
- **Native git over a JS git library.** git's rename detection, merge-base, and
  diff formatting match what developers see locally.
- **Textual heuristics, honestly labeled.** No rule claims AST/call-graph
  analysis. Every rule exposes a `limitations` string.
- **jiti for config loading** so `changeguard.config.ts` works without a build.
- **Core is external to the CLI bundle** because some deps (pino) cannot be
  bundled; they resolve at runtime.

## Extending to separate packages

To split, e.g., the rule engine into `@changeguard/rules`:

1. Move `packages/core/src/rules/` into `packages/rules/src/`.
2. Add a `package.json` depending on `@changeguard/core` for shared types.
3. Re-export from `core`'s `index.ts` (or have the CLI depend on both).

No consumer code changes because the CLI depends only on `@changeguard/core`'s
public entry point.
