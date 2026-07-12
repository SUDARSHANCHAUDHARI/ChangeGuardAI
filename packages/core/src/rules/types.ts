import type {
  ChangedFile,
  Finding,
  FindingCategory,
  FindingSeverity,
  RepositoryInfo
} from "../types/domain.js";
import type { ChangeGuardConfig } from "../config/schema.js";

/** Everything a rule may read. Rules never mutate context. */
export interface RuleContext {
  files: ChangedFile[];
  repository: RepositoryInfo;
  config: ChangeGuardConfig;
}

export interface ChangeGuardRule {
  id: string;
  name: string;
  description: string;
  category: FindingCategory;
  defaultSeverity: FindingSeverity;
  supportedLanguages?: string[];
  /** Human-readable statement of what this heuristic can and cannot detect. */
  limitations: string;
  evaluate(context: RuleContext): Promise<Finding[]>;
}

/**
 * Build a Finding with a deterministic id derived from its identifying fields.
 * The id is stable across runs for the same (ruleId, file, line, title), which
 * makes dedup and golden tests reproducible.
 */
export function makeFinding(input: {
  ruleId?: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  category: FindingCategory;
  file: string;
  startLine?: number;
  endLine?: number;
  evidence: string;
  recommendation: string;
  confidence: number;
  source?: Finding["source"];
}): Finding {
  const idBasis = `${input.ruleId ?? "ai"}|${input.file}|${input.startLine ?? ""}|${input.title}`;
  const finding: Finding = {
    id: shortHash(idBasis),
    title: input.title,
    description: input.description,
    severity: input.severity,
    category: input.category,
    file: input.file,
    evidence: input.evidence,
    recommendation: input.recommendation,
    confidence: input.confidence,
    source: input.source ?? "rule"
  };
  if (input.ruleId !== undefined) finding.ruleId = input.ruleId;
  if (input.startLine !== undefined) finding.startLine = input.startLine;
  if (input.endLine !== undefined) finding.endLine = input.endLine;
  return finding;
}

/**
 * Small, dependency-free, deterministic hash (FNV-1a) rendered as base36.
 * Not cryptographic — only used to produce stable, compact finding ids.
 */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}
