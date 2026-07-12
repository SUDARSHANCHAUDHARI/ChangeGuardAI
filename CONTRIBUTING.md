# Contributing to ChangeGuard AI

Thanks for helping improve ChangeGuard.

## Prerequisites

- Node.js 20+
- pnpm 10+

## Setup

```bash
pnpm install
pnpm build
```

## The five checks

Everything must pass before a change is merged:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Project layout

See [`docs/architecture.md`](docs/architecture.md). Core logic lives in
`packages/core`; the CLI is a thin layer in `apps/cli`.

## Adding a rule

1. Implement `ChangeGuardRule` in the matching file under
   `packages/core/src/rules/` (or use a factory in `rules/factories.ts`).
2. Set a stable `id`, a real `limitations` string, and only emit findings with
   evidence. No fabricated or speculative findings.
3. Register it in `rules/registry.ts`.
4. Add a unit test in `rules/rules.test.ts` and, ideally, a fixture under
   `fixtures/` with an `expected.json`.

## Adding a fixture

Drop `fixtures/<name>/change.patch` (e.g. `git diff main...feature > change.patch`)
and `fixtures/<name>/expected.json`. The fixture suite runs automatically. See
[`fixtures/README.md`](fixtures/README.md).

## Coding standards

- Strict TypeScript. No `any` without a documented reason.
- Match the surrounding style.
- Keep changes surgical — touch only what the change requires.
- Prefer the simplest solution that works.

## Commit messages

Conventional commits: `feat:`, `fix:`, `perf:`, `chore:`, `docs:`, `refactor:`,
`test:`, `ci:`, `build:`.

## AI-related changes

Treat all repository/model text as untrusted. New AI behavior must keep the
evidence-validation guarantees in [`docs/security.md`](docs/security.md) and must
never fail deterministic analysis unless `ai.required` is set.
