# ChangeGuard AI — GitHub Actions example

`changeguard.yml` runs ChangeGuard on every pull request:

1. Checks out the **full** git history (`fetch-depth: 0`) so diffs are accurate.
2. Installs Node.js 20 and pnpm.
3. Installs the `changeguard` CLI.
4. Runs `changeguard analyze --pr <number> --no-ai --fail-on high`.
5. Uploads the `.changeguard/` reports as a workflow artifact.
6. Fails the check when risk is **high** or above (`--fail-on high`).

## Setup

Copy `changeguard.yml` to `.github/workflows/changeguard.yml` in your repo.

The workflow uses the automatic `GITHUB_TOKEN` (declared with least-privilege
`contents: read` + `pull-requests: read`). ChangeGuard is **read-only** on
GitHub — it never posts comments or changes settings.

## Enabling AI (optional)

AI is off by default. To enable a self-hosted model (e.g. Ollama on a runner),
drop `--no-ai`, set `ai.enabled: true` in `changeguard.config.ts`, and provide
`CHANGEGUARD_PROVIDER`, `CHANGEGUARD_MODEL`, and `CHANGEGUARD_BASE_URL` as
environment variables or secrets. See [`docs/ai-providers.md`](../../docs/ai-providers.md).

## Exit codes

The job fails (non-zero exit) when the threshold is exceeded or a critical
security finding is present. See the exit-code table in the root README.
