import type { AnalysisResult, Finding } from "@changeguard/core";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

const LEVEL_LABEL: Record<string, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical"
};

const RECO_LABEL: Record<string, string> = {
  merge: "Merge",
  review: "Review",
  request_changes: "Request changes",
  block: "Block"
};

/** Human-readable risk summary printed by `analyze` and `risk`. */
export function printRiskSummary(result: AnalysisResult): void {
  const { risk } = result;
  const out: string[] = [];
  out.push("ChangeGuard AI Report");
  out.push("");
  out.push(`Risk: ${LEVEL_LABEL[risk.level] ?? risk.level} — ${risk.score}/100`);
  out.push(`Recommendation: ${RECO_LABEL[risk.recommendation] ?? risk.recommendation}`);
  out.push("");
  out.push(`Changed files: ${result.changedFiles.length}`);
  out.push(`Findings: ${result.findings.length}`);
  out.push("");
  out.push("Risk breakdown:");
  if (risk.contributions.length === 0) {
    out.push("  (none)");
  } else {
    for (const c of risk.contributions) {
      const pts = c.points >= 0 ? `+${c.points}` : `${c.points}`;
      out.push(`  ${pts.padStart(4)}  ${c.reason}`);
    }
  }
  if (result.findings.length > 0) {
    out.push("");
    out.push("Findings by severity:");
    for (const sev of SEVERITY_ORDER) {
      const n = result.findings.filter((f) => f.severity === sev).length;
      if (n > 0) out.push(`  ${sev.padEnd(9)} ${n}`);
    }
    out.push("");
    out.push("Top findings:");
    for (const f of topFindings(result.findings, 8)) {
      const loc = f.startLine !== undefined ? `${f.file}:${f.startLine}` : f.file;
      out.push(`  [${f.severity}] ${f.title} — ${loc}`);
    }
  }
  process.stdout.write(out.join("\n") + "\n");
}

function topFindings(findings: Finding[], n: number): Finding[] {
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return [...findings].sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)).slice(0, n);
}
