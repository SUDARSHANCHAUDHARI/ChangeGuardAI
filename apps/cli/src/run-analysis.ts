import { join } from "node:path";
import {
  analyze,
  createProvider,
  ExitCode,
  type AiAnalyzeOptions,
  type AnalysisResult,
  type ExitCodeValue
} from "@changeguard/core";
import type { CommandContext } from "./context.js";
import { resolveSourceEx, type SourceOptions } from "./resolve-source.js";

export interface AnalyzeCliOptions extends SourceOptions {
  failOn?: string;
  /** Set false by `--no-ai`. */
  ai?: boolean;
}

export interface AnalysisRun {
  result: AnalysisResult;
  ruleErrors: Array<{ ruleId: string; message: string }>;
  aiError?: string;
  aiUsed: boolean;
  outputDir: string;
}

const LEVEL_RANK: Record<string, number> = { low: 0, moderate: 1, high: 2, critical: 3 };

/**
 * Shared analysis runner used by analyze/risk/test-plan/report.
 *
 * AI runs only when config `ai.enabled` is true AND `--no-ai` was not passed.
 * A provider is built from config + environment. An AI failure degrades to
 * rules-only unless config `ai.required` is set.
 */
export async function runAnalysis(ctx: CommandContext, options: AnalyzeCliOptions): Promise<AnalysisRun> {
  const resolved = await resolveSourceEx(ctx, options);
  const source = resolved.source;
  const root = await ctx.git.repoRoot().catch(() => ctx.cwd);
  const outputDir = join(root, ctx.config.output.dir);

  const aiEnabled = ctx.config.ai.enabled && options.ai !== false;
  let ai: AiAnalyzeOptions | undefined;
  if (aiEnabled) {
    const provider = createProvider(ctx.config, process.env);
    ai = {
      provider,
      required: ctx.config.ai.required,
      ...(resolved.prTitle !== undefined ? { prTitle: resolved.prTitle } : {}),
      ...(resolved.prBody !== undefined ? { prBody: resolved.prBody } : {})
    };
    ctx.logger.debug({ provider: provider.name }, "AI analysis enabled");
  }

  const baseLabel = options.base ?? (source.kind === "range" ? source.base : undefined);
  const outcome = await analyze(ctx.git, {
    source,
    config: ctx.config,
    ...(baseLabel !== undefined ? { baseBranchLabel: baseLabel } : {}),
    ...(ai !== undefined ? { ai } : {})
  });

  for (const e of outcome.ruleErrors) {
    ctx.logger.warn({ ruleId: e.ruleId }, `rule error: ${e.message}`);
  }
  if (outcome.ai?.error !== undefined) {
    ctx.logger.warn(`AI analysis failed, continuing with rules only: ${outcome.ai.error}`);
  }
  for (const r of outcome.ai?.rejected ?? []) {
    ctx.logger.debug({ title: r.title }, `AI finding rejected: ${r.reason}`);
  }

  return {
    result: outcome.result,
    ruleErrors: outcome.ruleErrors,
    aiUsed: outcome.ai?.used ?? false,
    ...(outcome.ai?.error !== undefined ? { aiError: outcome.ai.error } : {}),
    outputDir
  };
}

/**
 * Determine the process exit code from analysis + flags. Precedence:
 *   critical security finding (3) > threshold exceeded (2) > success (0).
 */
export function computeExitCode(run: AnalysisRun, config: CommandContext["config"], failOn?: string): ExitCodeValue {
  const { result } = run;
  const hasCriticalSecurity = result.findings.some((f) => f.severity === "critical" && f.category === "security");
  if (hasCriticalSecurity) return ExitCode.CriticalSecurityFinding;

  if (failOn !== undefined) {
    const threshold = LEVEL_RANK[failOn.toLowerCase()];
    if (threshold !== undefined && LEVEL_RANK[result.risk.level]! >= threshold) {
      return ExitCode.RiskThresholdExceeded;
    }
  }

  if (result.risk.score >= config.risk.failThreshold) {
    return ExitCode.RiskThresholdExceeded;
  }
  return ExitCode.Success;
}
