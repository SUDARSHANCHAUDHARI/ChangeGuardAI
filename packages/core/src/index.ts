// Public API for @changeguard/core.
//
// Internal folders (git/, analyzer/, rules/, risk-engine/, reporters/, config/,
// llm/, shared/, types/) map 1:1 to the packages described in the architecture
// doc. They are re-exported here so the CLI depends only on this entry point;
// see docs/architecture.md for how to split them into separate packages later.

// Types & schemas
export * from "./types/domain.js";
export * as schemas from "./types/schemas.js";

// Shared
export { ExitCode, type ExitCodeValue } from "./shared/exit-codes.js";
export * from "./shared/errors.js";
export { createLogger, levelFromFlags, type Logger, type LogLevel, type LoggerOptions } from "./shared/logger.js";
export { matchGlob, matchAny } from "./shared/glob.js";

// Config
export { defineConfig } from "./config/define-config.js";
export { loadConfig, type LoadConfigResult } from "./config/load.js";
export { configSchema, type ChangeGuardConfig, type ChangeGuardConfigInput } from "./config/schema.js";

// Git
export { Git, type GitRunOptions } from "./git/git.js";
export {
  collectDiff,
  collectFromPatch,
  type DiffSource,
  type CollectedDiff
} from "./git/sources.js";
export {
  parseNameStatus,
  parseNumStat,
  splitUnifiedDiff,
  type RawChangedFile,
  type NumStatEntry
} from "./git/diff-parser.js";

// Analyzer
export { inspectRepository } from "./analyzer/inspect.js";
export { classifyFile, detectLanguage, type ClassificationOverride } from "./analyzer/classify.js";
export { normalizeFiles, type NormalizeOptions } from "./analyzer/normalize.js";
export { dedupeFindings } from "./analyzer/dedupe.js";
export { analyze, type AnalyzeOptions, type AnalyzeOutcome, type AiAnalyzeOptions } from "./analyzer/analyze.js";

// LLM (AI is always optional)
export {
  type LLMProvider,
  type ChangeAnalysisInput,
  type AIAnalysisResult,
  type AIRawFinding,
  type TestPlanInput as AITestPlanInput,
  aiFindingSchema,
  aiAnalysisResponseSchema
} from "./llm/types.js";
export { createProvider, type ProviderEnv } from "./llm/create.js";
export { MockProvider } from "./llm/providers/mock.js";
export { OllamaProvider } from "./llm/providers/ollama.js";
export { OpenAICompatibleProvider } from "./llm/providers/openai.js";
export { buildChangeContext, type ContextLimits } from "./llm/context-builder.js";
export { validateAIFindings, type ValidateOptions, type ValidationResult } from "./llm/validate.js";
export { extractJsonObject, parseJsonObject } from "./llm/json.js";
export { ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserPrompt } from "./llm/prompt.js";

// Rules
export { type ChangeGuardRule, type RuleContext, makeFinding } from "./rules/types.js";
export { allRules, getRuleById, runRules, type RunRulesResult } from "./rules/registry.js";
export {
  parseHunks,
  addedLines,
  removedLines,
  addedText,
  removedText,
  type DiffLine,
  type DiffLineType
} from "./rules/patch.js";

// GitHub (read-only)
export {
  fetchPullRequest,
  type PullRequestRef,
  type PullRequestData
} from "./github/pr.js";

// Risk
export { scoreRisk, type RiskInput } from "./risk-engine/risk.js";

// Test plan
export { generateTestPlan, type TestPlanInput } from "./test-plan/generate.js";

// Reporters
export { renderMarkdownReport } from "./reporters/markdown.js";
export { renderTestPlanMarkdown } from "./reporters/test-plan-md.js";
export { writeAnalysisOutput, type WriteOptions, type WrittenFiles } from "./reporters/output.js";
