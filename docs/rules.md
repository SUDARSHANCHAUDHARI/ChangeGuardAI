# Rules & Risk Model

ChangeGuard ships **42 deterministic rules**. Every finding includes evidence,
a file path, severity, a recommendation, a confidence score, and a source. Rules
never emit a finding without evidence.

All rules are **textual diff heuristics** — they read added/removed lines, not an
AST or call graph. Each rule carries a `limitations` string (visible via
`changeguard rules list --json`). ChangeGuard prefers false negatives over noisy
false positives.

Run `changeguard rules list` for the live list. As of v0.1:

### security

- `security.authorization-check-removed` (high)
- `security.authentication-check-removed` (high)
- `security.input-validation-removed` (medium)
- `security.rate-limit-removed` (medium)
- `security.cors-wildcard-added` (high)
- `security.csp-weakened` (medium)
- `security.secret-like-value-added` (critical)
- `security.insecure-cookie-setting` (medium)
- `security.sensitive-logging-added` (medium)
- `security.command-execution-added` (high)
- `security.raw-sql-added` (high)
- `security.token-validation-changed` (high)
- `security.github-workflow-permissions-expanded` (high)

### API compatibility

- `api.route-removed` (high)
- `api.http-method-changed` (high)
- `api.required-field-added` (medium)
- `api.public-function-signature-changed` (medium)
- `api.status-code-changed` (low)

### database

- `database.table-dropped` (critical)
- `database.column-dropped` (high)
- `database.non-null-column-without-default` (high)
- `database.unique-constraint-added` (medium)
- `database.index-removed` (medium)
- `database.destructive-migration` (high)
- `database.unbounded-query-added` (low)

### reliability

- `reliability.error-handling-removed` (medium)
- `reliability.timeout-removed` (medium)
- `reliability.retry-removed` (low)
- `reliability.fallback-removed` (low)
- `reliability.empty-catch-added` (medium)
- `reliability.promise-not-awaited` (low)

### configuration

- `configuration.environment-variable-added` (low)
- `configuration.production-default-changed` (medium)
- `configuration.health-check-removed` (medium)
- `configuration.feature-flag-default-changed` (medium)
- `configuration.deployment-workflow-changed` (low)

### testing

- `testing.source-changed-without-tests` (medium)
- `testing.auth-change-without-negative-tests` (high)
- `testing.api-change-without-contract-tests` (medium)
- `testing.migration-without-tests` (medium)
- `testing.snapshot-only-update` (low)
- `testing.bug-fix-without-regression-test` (medium)

## Deduplication

Findings are deduplicated by a composite fingerprint: `ruleId · file ·
line-bucket · normalized title · evidence fingerprint`. When an AI finding
collides with a deterministic one, the **deterministic finding is kept** and any
useful extra AI context is merged into its description.

## Risk model

The score is **deterministic**: the same findings + files always produce the
same number, and the number equals the sum of its contributions.

| Contribution | Points |
| --- | --- |
| Critical finding (each) | +30 |
| High finding (each) | +18 |
| Medium finding (each) | +8 |
| Low finding (each) | +3 |
| Authentication-related file changed | +15 |
| Authorization-related file changed | +20 |
| Database migration changed | +12 |
| Public API changed | +12 |
| Dependency change | +6 |
| CI permission change (finding) | +10 |
| Source changed without related tests | +15 |
| Large diff | +5 / +10 / +15 (>200 / >500 / >1000 changed lines) |
| Sensitive path (config) matched | configured points |
| Generated-only change | −10 |
| Documentation-only change | −20 |

Score is clamped to `[0, 100]`.

| Score | Level | Recommendation |
| --- | --- | --- |
| 0–19 | low | merge |
| 20–39 | moderate | review |
| 40–69 | high | request_changes |
| 70–100 | critical | block |

A critical **security** finding raises the recommendation to at least
`request_changes` and drives exit code `3` regardless of score.

## Writing a rule

Rules implement `ChangeGuardRule` (`packages/core/src/rules/types.ts`). Simple
pattern rules can use the `addedLineRule` / `removedGuardRule` factories. Every
rule must set `limitations` and only emit findings with real evidence. Test a
rule in isolation and add a fixture under `fixtures/`.
