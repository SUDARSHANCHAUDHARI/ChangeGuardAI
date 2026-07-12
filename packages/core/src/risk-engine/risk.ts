import type {
  ChangedFile,
  Finding,
  FindingSeverity,
  RiskContribution,
  RiskLevel,
  RiskResult,
  MergeRecommendation
} from "../types/domain.js";
import type { ChangeGuardConfig } from "../config/schema.js";
import { matchGlob } from "../shared/glob.js";

const SEVERITY_POINTS: Record<FindingSeverity, number> = {
  critical: 30,
  high: 18,
  medium: 8,
  low: 3,
  info: 0
};

export interface RiskInput {
  findings: Finding[];
  changedFiles: ChangedFile[];
  config: ChangeGuardConfig;
}

/**
 * Compute a deterministic risk score in [0, 100] with a full point breakdown.
 *
 * The model is intentionally simple and transparent (see docs/rules.md): given
 * identical findings and files it always returns the same score. Every point
 * added or removed is recorded as a RiskContribution so the report can explain
 * the number.
 */
export function scoreRisk(input: RiskInput): RiskResult {
  const contributions: RiskContribution[] = [];
  const { findings, changedFiles } = input;

  // 1. Findings by severity.
  const bySeverity: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity] += 1;
  for (const severity of ["critical", "high", "medium", "low"] as const) {
    const count = bySeverity[severity];
    if (count > 0) {
      const points = SEVERITY_POINTS[severity] * count;
      contributions.push({
        reason: `${count} ${severity} finding${count > 1 ? "s" : ""}`,
        points,
        source: "findings"
      });
    }
  }

  // 2. Sensitive categories present in the change set.
  const categories = new Set(changedFiles.map((f) => f.category));
  const addCat = (present: boolean, points: number, reason: string): void => {
    if (present) contributions.push({ reason, points, source: "files" });
  };
  addCat(categories.has("authentication"), 15, "Authentication-related file changed");
  addCat(categories.has("authorization"), 20, "Authorization-related file changed");
  addCat(categories.has("migration"), 12, "Database migration changed");
  addCat(categories.has("api"), 12, "Public API changed");
  addCat(categories.has("dependency"), 6, "Dependency change");

  // 3. CI permission change (only when the specific finding fired).
  if (findings.some((f) => f.ruleId === "security.github-workflow-permissions-expanded")) {
    contributions.push({ reason: "CI permission change", points: 10, source: "findings" });
  }

  // 4. Missing related tests.
  if (findings.some((f) => f.ruleId === "testing.source-changed-without-tests")) {
    contributions.push({ reason: "Source changed without related tests", points: 15, source: "findings" });
  }

  // 5. Diff size.
  const nonGenerated = changedFiles.filter((f) => f.category !== "generated");
  const churn = nonGenerated.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const sizePoints = churn > 1000 ? 15 : churn > 500 ? 10 : churn > 200 ? 5 : 0;
  if (sizePoints > 0) {
    contributions.push({ reason: `Large diff (${churn} changed lines)`, points: sizePoints, source: "size" });
  }

  // 6. Sensitive paths from config.
  for (const sp of input.config.sensitivePaths) {
    if (sp.risk <= 0) continue;
    const match = changedFiles.find((f) => matchGlob(sp.pattern, f.path));
    if (match !== undefined) {
      contributions.push({
        reason: `Sensitive path matched: ${sp.pattern}`,
        points: sp.risk,
        source: "config"
      });
    }
  }

  // 7. Whole-change discounts (only when the ENTIRE change is that kind).
  if (changedFiles.length > 0 && changedFiles.every((f) => f.category === "documentation")) {
    contributions.push({ reason: "Documentation-only change", points: -20, source: "files" });
  } else if (changedFiles.length > 0 && changedFiles.every((f) => f.category === "generated")) {
    contributions.push({ reason: "Generated-only change", points: -10, source: "files" });
  }

  const raw = contributions.reduce((sum, c) => sum + c.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  const level = toLevel(score);

  return {
    score,
    level,
    contributions,
    recommendation: toRecommendation(level, findings)
  };
}

function toLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 40) return "high";
  if (score >= 20) return "moderate";
  return "low";
}

function toRecommendation(level: RiskLevel, findings: Finding[]): MergeRecommendation {
  const hasCriticalSecurity = findings.some((f) => f.severity === "critical" && f.category === "security");
  if (level === "critical" || hasCriticalSecurity) return level === "critical" ? "block" : "request_changes";
  if (level === "high") return "request_changes";
  if (level === "moderate") return "review";
  return "merge";
}
