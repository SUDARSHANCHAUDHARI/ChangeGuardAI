# Configuration

## File resolution & precedence

ChangeGuard loads the first config it finds (first match wins):

1. `--config <path>` (explicit)
2. `changeguard.config.ts`
3. `changeguard.config.js`
4. `changeguard.config.mjs`
5. `.changeguardrc.json`
6. `changeguard` field in `package.json`
7. built-in defaults

`.ts` configs are loaded via [jiti](https://github.com/unjs/jiti), so no build
step is required. Invalid config exits with code `4`.

## Options

```ts
import { defineConfig } from "@changeguard/core";

export default defineConfig({
  baseBranch: "main",              // default base for `git diff <base>...HEAD`

  include: ["apps/**", "packages/**"], // if non-empty, only these paths analyzed
  exclude: ["**/generated/**", "**/*.snap", "**/dist/**"], // always dropped

  // Force a path pattern into a category (overrides built-in classification).
  classify: [{ pattern: "src/legacy/**", category: "source" }],

  // Extra risk points when a changed file matches a pattern.
  sensitivePaths: [
    { pattern: "src/auth/**", risk: 20, category: "authentication" },
    { pattern: "prisma/migrations/**", risk: 15, category: "database" },
    { pattern: ".github/workflows/**", risk: 12, category: "ci" }
  ],

  tests: {
    sourcePatterns: ["src/**/*.ts"],
    testPatterns: ["tests/**/*.test.ts", "tests/**/*.spec.ts"]
  },

  risk: {
    warnThreshold: 40,   // advisory
    failThreshold: 70    // `analyze`/`risk`/`report` exit 2 at/above this score
  },

  ai: {
    enabled: false,          // AI is opt-in
    required: false,         // if true, an AI failure fails the run
    provider: "ollama",      // ollama | openai | mock
    model: "qwen3:14b",      // required for ollama/openai (or CHANGEGUARD_MODEL)
    baseUrl: undefined,      // defaults per provider; or CHANGEGUARD_BASE_URL
    maxFiles: 30,            // cap files sent to the model
    maxContextChars: 24000,  // cap total diff characters sent
    minimumConfidence: 0.7   // reject AI findings below this
  },

  output: {
    dir: ".changeguard",
    markdown: true,
    json: true,
    sarif: false             // reserved; not emitted yet
  }
});
```

## Glob syntax

Patterns are matched against repo-relative POSIX paths:

- `*` — any run of non-`/` characters
- `**` — any run including `/` (spans directories)
- `?` — a single non-`/` character

Brace expansion and extglob are **not** supported.

## Include / exclude semantics

- `exclude` always wins — an excluded path is dropped even if included.
- A non-empty `include` restricts analysis to matching paths.
- An empty `include` means "everything not excluded".

## Environment variables (AI)

| Variable | Overrides |
| --- | --- |
| `CHANGEGUARD_PROVIDER` | `ai.provider` |
| `CHANGEGUARD_MODEL` | `ai.model` |
| `CHANGEGUARD_BASE_URL` | `ai.baseUrl` |
| `CHANGEGUARD_API_KEY` | (OpenAI-compatible auth; never logged) |
| `GITHUB_TOKEN` | required for `--pr` |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Completed; threshold not exceeded |
| 1 | Internal analysis error |
| 2 | Risk threshold exceeded |
| 3 | Critical security finding |
| 4 | Invalid configuration |

## Notes / limitations

- Untracked files are not included in `--working` diffs.
- `.changeguard/` is added to `.gitignore` by `changeguard init`; do not commit
  generated output.
