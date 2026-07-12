import type { ChangedFile, Finding } from "../types/domain.js";
import type { RepositoryInfo } from "../types/domain.js";
import type { ChangeAnalysisInput, AIFileContext } from "./types.js";

export interface ContextLimits {
  /** Max files to include (config.ai.maxFiles). */
  maxFiles: number;
  /** Approximate max characters across all included hunks (config.ai.maxContextChars). */
  maxContextChars: number;
  /** Max characters per single file's hunks. */
  maxPerFileChars?: number;
}

export interface BuildContextInput {
  changedFiles: ChangedFile[];
  deterministicFindings: Finding[];
  repository: RepositoryInfo;
  prTitle?: string;
  prBody?: string;
  limits: ContextLimits;
}

/**
 * Build a bounded, sanitized ChangeAnalysisInput. We never send the whole
 * repository — only changed-file diffs, ranked so the highest-signal files come
 * first, truncated to fit the configured character budget.
 *
 * Ranking priority: sensitive categories first, then larger diffs.
 */
export function buildChangeContext(input: BuildContextInput): ChangeAnalysisInput {
  const perFileCap = input.limits.maxPerFileChars ?? 4000;
  const ranked = [...input.changedFiles]
    .filter((f) => !f.binary && f.patch.trim().length > 0)
    .sort((a, b) => categoryRank(b) - categoryRank(a) || b.additions + b.deletions - (a.additions + a.deletions));

  const files: AIFileContext[] = [];
  let budget = input.limits.maxContextChars;
  for (const f of ranked) {
    if (files.length >= input.limits.maxFiles) break;
    if (budget <= 0) break;
    const hunks = truncate(stripDiffNoise(f.patch), Math.min(perFileCap, budget));
    files.push({
      path: f.path,
      status: f.status,
      category: f.category,
      additions: f.additions,
      deletions: f.deletions,
      hunks
    });
    budget -= hunks.length;
  }

  const result: ChangeAnalysisInput = {
    repository: {
      languages: input.repository.languages,
      frameworks: input.repository.frameworks,
      apiFrameworks: input.repository.apiFrameworks,
      databaseTools: input.repository.databaseTools
    },
    files,
    deterministicFindings: input.deterministicFindings.map((f) => ({
      ruleId: f.ruleId ?? "unknown",
      title: f.title,
      file: f.file,
      severity: f.severity
    }))
  };
  if (input.prTitle !== undefined) result.prTitle = input.prTitle;
  if (input.prBody !== undefined) result.prBody = input.prBody;
  return result;
}

const CATEGORY_RANK: Record<string, number> = {
  authentication: 6,
  authorization: 6,
  migration: 5,
  database: 5,
  api: 4,
  configuration: 3,
  ci: 3,
  infrastructure: 3,
  source: 2,
  dependency: 2,
  test: 1
};

function categoryRank(f: ChangedFile): number {
  return CATEGORY_RANK[f.category] ?? 0;
}

/** Drop index/hash lines that add no analytical value, keeping hunks. */
function stripDiffNoise(patch: string): string {
  return patch
    .split("\n")
    .filter((l) => !l.startsWith("index ") && !l.startsWith("diff --git ") && !l.startsWith("similarity index"))
    .join("\n");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max))}\n… [truncated]`;
}
