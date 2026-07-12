# GitHub Actions

A ready-to-use workflow lives in
[`examples/github-action/`](../examples/github-action/).

## What it does

1. Checks out the repository with **full history** (`fetch-depth: 0`) so diffs
   are accurate on shallow-by-default CI checkouts.
2. Installs Node.js 20 + pnpm.
3. Installs the `changeguard` CLI.
4. Runs `changeguard analyze --pr <number> --no-ai --fail-on high`.
5. Uploads `.changeguard/` reports as a workflow artifact (`always()`).
6. Fails the check when risk is **high**+ or a critical security finding exists.

## Setup

Copy `examples/github-action/changeguard.yml` to
`.github/workflows/changeguard.yml`.

```yaml
permissions:
  contents: read
  pull-requests: read
```

The automatic `GITHUB_TOKEN` is sufficient — ChangeGuard only **reads** the PR.

## Tuning

- Drop `--fail-on high` (or change the level) to adjust strictness. The config
  `risk.failThreshold` also gates the exit code.
- Add `--format markdown` to capture a readable report file (the example pipes it
  to `changeguard-report.md`).
- To post the report as a PR comment, add a step using your preferred action —
  ChangeGuard itself does not write to GitHub yet.

## Enabling AI on CI

Off by default. To use a self-hosted model, remove `--no-ai`, set
`ai.enabled: true`, and provide `CHANGEGUARD_PROVIDER` / `CHANGEGUARD_MODEL` /
`CHANGEGUARD_BASE_URL` (and `CHANGEGUARD_API_KEY` for OpenAI-compatible servers)
as environment variables or repository secrets. Hosted API usage will incur cost
and send diff context to that provider — see [`docs/ai-providers.md`](ai-providers.md).
