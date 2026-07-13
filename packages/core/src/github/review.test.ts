import { describe, it, expect } from "vitest";
import { renderPrComment, postPrComment, REVIEW_MARKER } from "./review.js";
import { GitHubTokenMissingError } from "../shared/errors.js";
import type { AnalysisResult } from "../types/domain.js";

const result: AnalysisResult = {
  repository: {
    root: "/repo",
    baseBranch: "main",
    languages: ["typescript"],
    frameworks: [],
    testFrameworks: [],
    monorepo: false,
    databaseTools: [],
    apiFrameworks: [],
    ciConfigured: false
  },
  changedFiles: [
    {
      path: "src/auth/session.ts",
      status: "modified",
      additions: 1,
      deletions: 2,
      patch: "",
      binary: false,
      category: "authentication"
    }
  ],
  findings: [
    {
      id: "a1",
      ruleId: "security.authorization-check-removed",
      title: "Authorization check removed",
      description: "",
      severity: "high",
      category: "security",
      file: "src/auth/session.ts",
      startLine: 44,
      evidence: "authorize(req)",
      recommendation: "add test",
      confidence: 0.6,
      source: "rule"
    }
  ],
  affectedAreas: ["authentication"],
  risk: {
    score: 68,
    level: "high",
    contributions: [],
    recommendation: "request_changes"
  },
  testPlan: {
    summary: "s",
    scenarios: [
      {
        id: "t1",
        title: "Non-owner update attempt",
        priority: "critical",
        category: "negative",
        preconditions: [],
        steps: [],
        expectedResults: [],
        relatedFiles: [],
        relatedFindings: []
      }
    ],
    regressionAreas: [],
    assumptions: [],
    unknowns: []
  },
  generatedAt: "2026-01-01T00:00:00.000Z"
};

describe("renderPrComment", () => {
  it("starts with the marker for sticky-comment matching", () => {
    expect(renderPrComment(result).startsWith(REVIEW_MARKER)).toBe(true);
  });

  it("is deterministic and includes headline, findings, and tests", () => {
    const a = renderPrComment(result);
    expect(a).toBe(renderPrComment(result));
    expect(a).toContain("**Risk: High — 68/100**");
    expect(a).toContain("Recommendation: **Request changes**");
    expect(a).toContain("Authorization check removed");
    expect(a).toContain("`src/auth/session.ts:44`");
    expect(a).toContain("Non-owner update attempt");
  });

  it("escapes pipes in finding titles", () => {
    const withPipe = structuredClone(result);
    withPipe.findings[0]!.title = "A | B breaking";
    expect(renderPrComment(withPipe)).toContain("A \\| B breaking");
  });
});

describe("postPrComment", () => {
  it("throws GitHubTokenMissingError without a token", async () => {
    await expect(postPrComment(undefined, { owner: "o", repo: "r", number: 1 }, "body")).rejects.toBeInstanceOf(
      GitHubTokenMissingError
    );
  });
});
