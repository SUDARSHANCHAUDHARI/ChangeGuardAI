import type { ChangedFile, FileCategory, FindingCategory, FindingSeverity } from "../types/domain.js";
import { addedLines, removedLines, type DiffLine } from "./patch.js";
import { makeFinding, type ChangeGuardRule, type RuleContext } from "./types.js";

function truncate(text: string, max = 200): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

type FileFilter = FileCategory[] | ((f: ChangedFile) => boolean);

function fileMatches(file: ChangedFile, only?: FileFilter): boolean {
  if (only === undefined) return true;
  if (typeof only === "function") return only(file);
  return only.includes(file.category);
}

export interface AddedLineRuleConfig {
  id: string;
  name: string;
  description: string;
  category: FindingCategory;
  severity: FindingSeverity;
  limitations: string;
  pattern: RegExp;
  /** Restrict to certain file categories or a custom predicate. */
  only?: FileFilter;
  recommendation: string;
  confidence: number;
  supportedLanguages?: string[];
}

/**
 * Rule that flags a regex match on ADDED lines. Used for "something risky was
 * introduced" (secrets, wildcard CORS, raw SQL, command exec, etc.). Each match
 * becomes a finding with the exact line as evidence.
 */
export function addedLineRule(cfg: AddedLineRuleConfig): ChangeGuardRule {
  const rule: ChangeGuardRule = {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    category: cfg.category,
    defaultSeverity: cfg.severity,
    limitations: cfg.limitations,
    async evaluate(ctx: RuleContext) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.binary) continue;
        if (!fileMatches(file, cfg.only)) continue;
        for (const line of addedLines(file.patch)) {
          if (cfg.pattern.test(line.content)) {
            findings.push(
              makeFinding({
                ruleId: cfg.id,
                title: cfg.name,
                description: cfg.description,
                severity: cfg.severity,
                category: cfg.category,
                file: file.path,
                ...(line.newLine !== undefined ? { startLine: line.newLine } : {}),
                evidence: truncate(line.content),
                recommendation: cfg.recommendation,
                confidence: cfg.confidence
              })
            );
          }
        }
      }
      return findings;
    }
  };
  if (cfg.supportedLanguages !== undefined) rule.supportedLanguages = cfg.supportedLanguages;
  return rule;
}

export interface RemovedGuardRuleConfig {
  id: string;
  name: string;
  description: string;
  category: FindingCategory;
  severity: FindingSeverity;
  limitations: string;
  pattern: RegExp;
  only?: FileFilter;
  recommendation: string;
  confidence: number;
}

/**
 * Rule that flags when a pattern is present on REMOVED lines and the number of
 * matches strictly decreased (removed more than were re-added). Used for
 * "a protective check was removed" (auth guards, validation, error handling).
 *
 * This is intentionally conservative: it only fires on a net decrease, favoring
 * false negatives over noise, and cannot understand semantics — a guard moved
 * to another file will read as a removal here. That limitation is documented on
 * every rule built with this factory.
 */
export function removedGuardRule(cfg: RemovedGuardRuleConfig): ChangeGuardRule {
  const countMatches = (lines: DiffLine[]): number =>
    lines.filter((l) => cfg.pattern.test(l.content)).length;

  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    category: cfg.category,
    defaultSeverity: cfg.severity,
    limitations: cfg.limitations,
    async evaluate(ctx: RuleContext) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.binary || file.status === "added") continue;
        if (!fileMatches(file, cfg.only)) continue;
        const removed = removedLines(file.patch);
        const added = addedLines(file.patch);
        const removedCount = countMatches(removed);
        const addedCount = countMatches(added);
        if (removedCount > addedCount) {
          const sample = removed.find((l) => cfg.pattern.test(l.content));
          findings.push(
            makeFinding({
              ruleId: cfg.id,
              title: cfg.name,
              description: cfg.description,
              severity: cfg.severity,
              category: cfg.category,
              file: file.path,
              ...(sample?.oldLine !== undefined ? { startLine: sample.oldLine } : {}),
              evidence: truncate(sample?.content ?? cfg.pattern.source),
              recommendation: cfg.recommendation,
              confidence: cfg.confidence
            })
          );
        }
      }
      return findings;
    }
  };
}
