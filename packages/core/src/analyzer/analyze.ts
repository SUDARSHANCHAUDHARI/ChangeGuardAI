import type { Git } from "../git/git.js";
import type { AnalysisResult, ChangedFile, Finding, RepositoryInfo } from "../types/domain.js";
import type { ChangeGuardConfig } from "../config/schema.js";
import { collectDiff, type DiffSource } from "../git/sources.js";
import { normalizeFiles } from "./normalize.js";
import { inspectRepository } from "./inspect.js";
import { runRules } from "../rules/registry.js";
import { dedupeFindings } from "./dedupe.js";
import { scoreRisk } from "../risk-engine/risk.js";
import { generateTestPlan } from "../test-plan/generate.js";
import type { LLMProvider } from "../llm/types.js";
import { buildChangeContext } from "../llm/context-builder.js";
import { validateAIFindings } from "../llm/validate.js";
import { isChangeGuardError } from "../shared/errors.js";

export interface AiAnalyzeOptions {
  provider: LLMProvider;
  /** When true, an AI failure aborts analysis instead of degrading to rules-only. */
  required: boolean;
  prTitle?: string;
  prBody?: string;
}

export interface AnalyzeOptions {
  source: DiffSource;
  config: ChangeGuardConfig;
  /** Override the base branch label recorded in the report (e.g. from --base). */
  baseBranchLabel?: string;
  ai?: AiAnalyzeOptions;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

export interface AnalyzeOutcome {
  result: AnalysisResult;
  ruleErrors: Array<{ ruleId: string; message: string }>;
  ai?: {
    used: boolean;
    error?: string;
    rejected: Array<{ title: string; reason: string }>;
  };
}

/**
 * Full analysis pipeline:
 *   collect diff → normalize/classify → inspect repo → run rules →
 *   (optional) AI findings, validated against the diff → merge → dedupe →
 *   score risk → generate test plan → assemble AnalysisResult.
 *
 * A failed AI call never fails deterministic analysis unless `ai.required` is
 * set. Deterministic findings always win a dedup collision with AI findings.
 */
export async function analyze(git: Git, options: AnalyzeOptions): Promise<AnalyzeOutcome> {
  const { config } = options;

  const collected = await collectDiff(git, options.source);
  const changedFiles = normalizeFiles(collected.files, {
    include: config.include,
    exclude: config.exclude,
    classify: config.classify
  });

  const repository = await inspectRepository(git, {
    baseBranch: options.baseBranchLabel ?? config.baseBranch
  });

  const { findings: ruleFindings, errors: ruleErrors } = await runRules({
    files: changedFiles,
    repository,
    config
  });

  let aiFindings: Finding[] = [];
  let aiMeta: AiCollectResult | undefined;
  if (options.ai !== undefined) {
    aiMeta = await collectAiFindings(options.ai, changedFiles, ruleFindings, repository, config);
    aiFindings = aiMeta.findings;
  }

  const combined = [...ruleFindings, ...aiFindings];
  const findings = dedupeFindings(combined).sort(byFileThenLine);

  const risk = scoreRisk({ findings, changedFiles, config });
  const testPlan = generateTestPlan({ changedFiles, findings });
  const affectedAreas = computeAffectedAreas(changedFiles);
  const now = options.now ?? (() => new Date());

  const result: AnalysisResult = {
    repository,
    changedFiles,
    findings,
    affectedAreas,
    risk,
    testPlan,
    generatedAt: now().toISOString()
  };

  const outcome: AnalyzeOutcome = { result, ruleErrors };
  if (aiMeta !== undefined) {
    outcome.ai = {
      used: aiMeta.used,
      rejected: aiMeta.rejected,
      ...(aiMeta.error !== undefined ? { error: aiMeta.error } : {})
    };
  }
  return outcome;
}

interface AiCollectResult {
  findings: Finding[];
  used: boolean;
  error?: string;
  rejected: Array<{ title: string; reason: string }>;
}

async function collectAiFindings(
  ai: AiAnalyzeOptions,
  changedFiles: ChangedFile[],
  ruleFindings: Finding[],
  repository: RepositoryInfo,
  config: ChangeGuardConfig
): Promise<AiCollectResult> {
  try {
    const context = buildChangeContext({
      changedFiles,
      deterministicFindings: ruleFindings,
      repository,
      limits: { maxFiles: config.ai.maxFiles, maxContextChars: config.ai.maxContextChars },
      ...(ai.prTitle !== undefined ? { prTitle: ai.prTitle } : {}),
      ...(ai.prBody !== undefined ? { prBody: ai.prBody } : {})
    });
    const raw = await ai.provider.analyzeChange(context);
    const { findings, rejected } = validateAIFindings(raw.findings, {
      changedFiles,
      deterministicFindings: ruleFindings,
      minimumConfidence: config.ai.minimumConfidence
    });
    return { findings, used: true, rejected };
  } catch (err) {
    if (ai.required) throw err;
    const message = isChangeGuardError(err) ? err.message : err instanceof Error ? err.message : String(err);
    return { findings: [], used: false, error: message, rejected: [] };
  }
}

function byFileThenLine(a: Finding, b: Finding): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return (a.startLine ?? 0) - (b.startLine ?? 0);
}

function computeAffectedAreas(files: ChangedFile[]): string[] {
  const areas = new Set<string>();
  for (const f of files) {
    if (f.category !== "unknown") areas.add(f.category);
    const parts = f.path.split("/");
    if (parts.length > 1) areas.add(`${parts[0]}/`);
  }
  return [...areas].sort();
}
