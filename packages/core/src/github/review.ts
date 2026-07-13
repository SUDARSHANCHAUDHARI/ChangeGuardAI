import { Octokit } from "@octokit/rest";
import type { AnalysisResult, Finding, FindingSeverity, RiskResult } from "../types/domain.js";
import { GitHubTokenMissingError } from "../shared/errors.js";
import type { PullRequestRef } from "./pr.js";

/**
 * Hidden marker used to find and update ChangeGuard's own PR comment so we keep
 * a single sticky comment instead of posting on every push.
 */
export const REVIEW_MARKER = "<!-- changeguard-ai:report -->";

const SEVERITY_ORDER: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

const LEVEL_LABEL: Record<RiskResult["level"], string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical"
};

const RECO_LABEL: Record<RiskResult["recommendation"], string> = {
  merge: "Merge",
  review: "Review",
  request_changes: "Request changes",
  block: "Block"
};

/**
 * Render the compact Markdown body posted as a PR comment. Deterministic for a
 * given AnalysisResult. Begins with REVIEW_MARKER so it can be located later.
 */
export function renderPrComment(result: AnalysisResult): string {
  const { risk } = result;
  const s: string[] = [];
  s.push(REVIEW_MARKER);
  s.push("## ChangeGuard AI");
  s.push("");
  s.push(`**Risk: ${LEVEL_LABEL[risk.level]} — ${risk.score}/100**`);
  s.push("");
  s.push(`Recommendation: **${RECO_LABEL[risk.recommendation]}**`);
  s.push("");

  s.push("### Main findings");
  s.push("");
  if (result.findings.length === 0) {
    s.push("_No findings._");
  } else {
    s.push("| Severity | Finding | Location |");
    s.push("| --- | --- | --- |");
    for (const f of topFindings(result.findings, 10)) {
      const loc = f.startLine !== undefined ? `\`${f.file}:${f.startLine}\`` : `\`${f.file}\``;
      s.push(`| ${f.severity} | ${escapeCell(f.title)} | ${loc} |`);
    }
    const extra = result.findings.length - 10;
    if (extra > 0) s.push(`| … | _${extra} more_ | |`);
  }
  s.push("");

  if (result.affectedAreas.length > 0) {
    s.push("### Affected areas");
    s.push("");
    s.push(result.affectedAreas.map((a) => `- ${a}`).join("\n"));
    s.push("");
  }

  const tests = result.testPlan.scenarios.slice(0, 8);
  if (tests.length > 0) {
    s.push("### Recommended tests");
    s.push("");
    for (const t of tests) s.push(`- [${t.priority}] ${escapeCell(t.title)}`);
    s.push("");
  }

  s.push("---");
  s.push(`_${result.changedFiles.length} file(s) changed · ${result.findings.length} finding(s) · generated ${result.generatedAt}_`);
  return s.join("\n");
}

function topFindings(findings: Finding[], n: number): Finding[] {
  const rank = (sev: FindingSeverity): number => SEVERITY_ORDER.indexOf(sev);
  return [...findings].sort((a, b) => rank(a.severity) - rank(b.severity)).slice(0, n);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export interface PostReviewResult {
  action: "created" | "updated";
  commentId: number;
  url: string;
}

/**
 * Upsert ChangeGuard's sticky comment on a pull request.
 *
 * This is the only GitHub WRITE ChangeGuard performs, and only when explicitly
 * requested (CLI `--post`). It finds an existing comment containing
 * REVIEW_MARKER and updates it; otherwise it creates a new one. It never posts
 * duplicate comments and never touches reviews, labels, or status checks.
 */
export async function postPrComment(
  token: string | undefined,
  ref: PullRequestRef,
  body: string
): Promise<PostReviewResult> {
  if (token === undefined || token.trim().length === 0) {
    throw new GitHubTokenMissingError();
  }
  const octokit = new Octokit({ auth: token });

  const existing = await octokit.paginate(octokit.issues.listComments, {
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.number,
    per_page: 100
  });
  const mine = existing.find((c) => typeof c.body === "string" && c.body.includes(REVIEW_MARKER));

  if (mine !== undefined) {
    const res = await octokit.issues.updateComment({
      owner: ref.owner,
      repo: ref.repo,
      comment_id: mine.id,
      body
    });
    return { action: "updated", commentId: mine.id, url: res.data.html_url };
  }

  const res = await octokit.issues.createComment({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.number,
    body
  });
  return { action: "created", commentId: res.data.id, url: res.data.html_url };
}
