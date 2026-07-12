# AI Providers

AI is **optional** and **off by default**. Every command works with `--no-ai`,
and all deterministic analysis runs regardless of AI availability. A failed AI
call degrades to rules-only unless `ai.required: true`.

ChangeGuard talks to AI through one interface (`LLMProvider`):

```ts
interface LLMProvider {
  name: string;
  analyzeChange(input: ChangeAnalysisInput): Promise<AIAnalysisResult>;
  generateTestPlan(input: TestPlanInput): Promise<TestPlan>;
}
```

Three implementations ship:

| Provider | Use |
| --- | --- |
| `ollama` | Local [Ollama](https://ollama.com) server (`/api/chat`, `format: json`) |
| `openai` | Any OpenAI-compatible `/v1/chat/completions` server |
| `mock` | Deterministic, offline; for tests and demos |

## Enabling AI

Set `ai.enabled: true` in config, then choose a provider via config or env.
Environment variables take precedence over config.

### Ollama

```bash
export CHANGEGUARD_PROVIDER=ollama
export CHANGEGUARD_MODEL=qwen3:14b
export CHANGEGUARD_BASE_URL=http://localhost:11434   # default
changeguard analyze --base main
```

### OpenAI-compatible

```bash
export CHANGEGUARD_PROVIDER=openai
export CHANGEGUARD_MODEL=gpt-4o-mini
export CHANGEGUARD_BASE_URL=https://api.openai.com   # or your LM Studio / vLLM / LiteLLM URL
export CHANGEGUARD_API_KEY=sk-...
changeguard analyze --base main
```

The base URL may include or omit a `/v1` suffix. The API key is sent only in the
`Authorization` header and is never logged.

No model names or API keys are hardcoded. If AI is enabled without a model, the
run fails with an invalid-configuration error (exit 4).

## How context is built

ChangeGuard never sends your whole repository to a model. The context builder
(`llm/context-builder.ts`) includes only:

- repository metadata (languages/frameworks)
- optional PR title/body (for `--pr`)
- changed-file diff hunks, ranked with sensitive categories first
- deterministic findings (so the model avoids repeating them)

…truncated to `ai.maxFiles` files and `ai.maxContextChars` characters.

## Evidence validation (why AI output is trustworthy-ish)

Model output is treated as **untrusted**. Every AI finding must pass
`validateAIFindings` or it is rejected. See [`docs/security.md`](security.md).

## AI test-plan generation

`generateTestPlan` is implemented on every provider, but the CLI currently uses
the **deterministic** test-plan generator. AI test-plan enrichment is available
programmatically and may be wired into the CLI in a future release.
