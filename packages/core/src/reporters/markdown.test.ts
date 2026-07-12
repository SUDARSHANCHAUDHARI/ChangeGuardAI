import { describe, it, expect } from "vitest";
import { renderMarkdownReport } from "./markdown.js";
import type { AnalysisResult } from "../types/domain.js";

const result: AnalysisResult = {
  repository: {
    root: "/repo",
    baseBranch: "main",
    currentBranch: "feature",
    languages: ["typescript"],
    frameworks: [],
    testFrameworks: ["vitest"],
    monorepo: false,
    databaseTools: [],
    apiFrameworks: [],
    ciConfigured: true
  },
  changedFiles: [
    {
      path: "src/auth/session.ts",
      status: "modified",
      additions: 3,
      deletions: 5,
      patch: "",
      binary: false,
      language: "typescript",
      category: "authentication"
    }
  ],
  findings: [
    {
      id: "abc1234",
      ruleId: "security.authorization-check-removed",
      title: "Authorization check removed",
      description: "An authorization guard was removed.",
      severity: "high",
      category: "security",
      file: "src/auth/session.ts",
      startLine: 12,
      evidence: "authorize(req)",
      recommendation: "Add a negative test.",
      confidence: 0.55,
      source: "rule"
    }
  ],
  affectedAreas: ["authentication", "src/"],
  risk: {
    score: 53,
    level: "high",
    contributions: [
      { reason: "1 high finding", points: 18, source: "findings" },
      { reason: "Authentication-related file changed", points: 15, source: "files" }
    ],
    recommendation: "request_changes"
  },
  testPlan: {
    summary: "1 file(s) changed.",
    scenarios: [],
    regressionAreas: ["src/"],
    assumptions: ["Derived from a textual diff."],
    unknowns: []
  },
  generatedAt: "2026-01-01T00:00:00.000Z"
};

describe("renderMarkdownReport", () => {
  it("is deterministic for identical input", () => {
    expect(renderMarkdownReport(result)).toBe(renderMarkdownReport(result));
  });

  it("includes the required sections and headline", () => {
    const md = renderMarkdownReport(result);
    expect(md).toContain("# ChangeGuard AI Report");
    expect(md).toContain("Risk: High — 53/100");
    expect(md).toContain("Recommendation: Request changes");
    expect(md).toContain("## Risk Breakdown");
    expect(md).toContain("## Changed Files");
    expect(md).toContain("## Findings");
    expect(md).toContain("Authorization check removed");
    expect(md).toContain("`src/auth/session.ts:12`");
    expect(md).toContain("## Test Gaps & Plan");
    expect(md).toContain("2026-01-01T00:00:00.000Z");
  });
});
