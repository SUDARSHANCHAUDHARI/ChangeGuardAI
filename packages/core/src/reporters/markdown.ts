import type {
  AnalysisResult,
  ChangedFile,
  Finding,
  FindingSeverity,
  RiskResult
} from "../types/domain.js";

const SEVERITY_ORDER: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

const LEVEL_LABEL: Record<RiskResult["level"], string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical"
};

const RECOMMENDATION_LABEL: Record<RiskResult["recommendation"], string> = {
  merge: "Merge",
  review: "Review",
  request_changes: "Request changes",
  block: "Block"
};

/**
 * Deterministic Markdown report. Given identical input it produces byte-for-byte
 * identical output (used by golden tests). No timestamps are interpolated beyond
 * the value already recorded in `result.generatedAt`.
 */
export function renderMarkdownReport(result: AnalysisResult): string {
  const s: string[] = [];
  const { risk } = result;

  s.push("# ChangeGuard AI Report");
  s.push("");
  s.push(`Risk: ${LEVEL_LABEL[risk.level]} — ${risk.score}/100`);
  s.push("");
  s.push(`Recommendation: ${RECOMMENDATION_LABEL[risk.recommendation]}`);
  s.push("");

  s.push("## Change Summary");
  s.push("");
  s.push(...changeSummary(result.changedFiles));
  s.push("");

  s.push("## Risk Breakdown");
  s.push("");
  if (risk.contributions.length === 0) {
    s.push("_No scored contributions._");
  } else {
    s.push("| Points | Reason | Source |");
    s.push("| ---: | --- | --- |");
    for (const c of risk.contributions) {
      const points = c.points >= 0 ? `+${c.points}` : `${c.points}`;
      s.push(`| ${points} | ${escapeCell(c.reason)} | ${escapeCell(c.source ?? "")} |`);
    }
  }
  s.push("");

  s.push("## Changed Files");
  s.push("");
  if (result.changedFiles.length === 0) {
    s.push("_No files changed._");
  } else {
    s.push("| File | Status | Category | +/− |");
    s.push("| --- | --- | --- | --- |");
    for (const f of result.changedFiles) {
      const name = f.previousPath !== undefined ? `${f.previousPath} → ${f.path}` : f.path;
      s.push(`| ${escapeCell(name)} | ${f.status} | ${f.category} | +${f.additions}/−${f.deletions} |`);
    }
  }
  s.push("");

  s.push("## Affected Areas");
  s.push("");
  s.push(result.affectedAreas.length === 0 ? "_None identified._" : result.affectedAreas.map((a) => `- ${a}`).join("\n"));
  s.push("");

  s.push("## Findings");
  s.push("");
  s.push(...renderFindings(result.findings));
  s.push("");

  s.push("## Test Gaps & Plan");
  s.push("");
  s.push(result.testPlan.summary.trim().length > 0 ? result.testPlan.summary : "_No test plan generated._");
  s.push("");
  if (result.testPlan.scenarios.length > 0) {
    for (const sc of result.testPlan.scenarios) {
      s.push(`- **[${sc.priority}] ${escapeInline(sc.title)}** (${sc.category})`);
    }
    s.push("");
  }

  s.push("## Unknowns");
  s.push("");
  s.push(
    result.testPlan.unknowns.length === 0
      ? "_None recorded._"
      : result.testPlan.unknowns.map((u) => `- ${u}`).join("\n")
  );
  s.push("");

  s.push("## Metadata");
  s.push("");
  s.push(`- Repository root: \`${result.repository.root}\``);
  s.push(`- Base branch: \`${result.repository.baseBranch}\``);
  if (result.repository.currentBranch !== undefined) {
    s.push(`- Current branch: \`${result.repository.currentBranch}\``);
  }
  s.push(`- Languages: ${listOrDash(result.repository.languages)}`);
  s.push(`- Generated at: ${result.generatedAt}`);
  s.push("");

  return s.join("\n");
}

function changeSummary(files: ChangedFile[]): string[] {
  const counts: Record<string, number> = { added: 0, modified: 0, deleted: 0, renamed: 0 };
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    counts[f.status] = (counts[f.status] ?? 0) + 1;
    additions += f.additions;
    deletions += f.deletions;
  }
  return [
    `- ${files.length} file(s) changed: ${counts["added"]} added, ${counts["modified"]} modified, ${counts["deleted"]} deleted, ${counts["renamed"]} renamed`,
    `- +${additions} / −${deletions} lines`
  ];
}

function renderFindings(findings: Finding[]): string[] {
  if (findings.length === 0) return ["_No findings._"];
  const out: string[] = [];
  for (const severity of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    out.push(`### ${severity.toUpperCase()} (${group.length})`);
    out.push("");
    for (const f of group) {
      const loc = f.startLine !== undefined ? `${f.file}:${f.startLine}` : f.file;
      out.push(`#### ${escapeInline(f.title)}`);
      out.push("");
      out.push(`- File: \`${loc}\``);
      if (f.ruleId !== undefined) out.push(`- Rule: \`${f.ruleId}\``);
      out.push(`- Category: ${f.category}`);
      out.push(`- Confidence: ${f.confidence.toFixed(2)} · Source: ${f.source}`);
      if (f.description.trim().length > 0) {
        out.push(`- ${escapeInline(f.description)}`);
      }
      out.push(`- Evidence:`);
      out.push("");
      out.push("  ```");
      for (const line of f.evidence.split("\n")) out.push(`  ${line}`);
      out.push("  ```");
      out.push("");
      out.push(`- Recommendation: ${escapeInline(f.recommendation)}`);
      out.push("");
    }
  }
  return out;
}

function listOrDash(items: string[]): string {
  return items.length === 0 ? "_none_" : items.join(", ");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function escapeInline(value: string): string {
  return value.replace(/\n/g, " ");
}
