# Fixtures

Each fixture is a self-contained change used by the deterministic test suite
(`packages/core/src/fixtures.test.ts`).

```
fixtures/
  <name>/
    change.patch     # a unified git diff representing the change
    expected.json    # assertions about the analysis of that change
```

`expected.json` fields:

| field              | meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `expectRuleIds`    | rule ids that MUST fire on this change                         |
| `forbidRuleIds`    | rule ids that must NOT fire (optional)                         |
| `riskLevelAtLeast` | the computed risk level must be at least this (optional)       |
| `riskLevelAtMost`  | the computed risk level must be at most this (optional)        |

Patch-based fixtures are used (rather than `before/`+`after/` trees) so the
tests are fully deterministic and require no git invocation. To add a fixture,
drop a `change.patch` (e.g. `git diff main...feature > change.patch`) and an
`expected.json`.
