import { describe, it, expect } from "vitest";
import { validateAIFindings } from "./validate.js";
import type { AIRawFinding } from "./types.js";
import type { ChangedFile, Finding } from "../types/domain.js";

const file: ChangedFile = {
  path: "src/auth/session.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  patch: `@@ -1,2 +1,2 @@\n-  authorize(req);\n+  // authorize removed\n   next();`,
  binary: false,
  language: "typescript",
  category: "authentication"
};

function raw(partial: Partial<AIRawFinding>): AIRawFinding {
  return {
    title: "Authorization removed",
    description: "desc",
    severity: "high",
    category: "security",
    file: "src/auth/session.ts",
    evidence: "authorize removed",
    recommendation: "add it back",
    confidence: 0.9,
    ...partial
  };
}

const base = { changedFiles: [file], deterministicFindings: [] as Finding[], minimumConfidence: 0.7 };

describe("validateAIFindings", () => {
  it("accepts a well-formed finding with supported evidence", () => {
    const { findings, rejected } = validateAIFindings([raw({})], base);
    expect(findings).toHaveLength(1);
    expect(rejected).toHaveLength(0);
    expect(findings[0]?.source).toBe("ai");
    expect(findings[0]?.ruleId).toBeUndefined();
  });

  it("rejects findings referencing a file not in the change set", () => {
    const { findings, rejected } = validateAIFindings([raw({ file: "src/other.ts" })], base);
    expect(findings).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/not in the change set/);
  });

  it("rejects findings whose evidence is not in the diff", () => {
    const { findings, rejected } = validateAIFindings([raw({ evidence: "this text is fabricated entirely" })], base);
    expect(findings).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/evidence not found/);
  });

  it("rejects low-confidence findings", () => {
    const { findings, rejected } = validateAIFindings([raw({ confidence: 0.3 })], base);
    expect(findings).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/confidence/);
  });

  it("rejects style-only findings", () => {
    const { findings } = validateAIFindings(
      [raw({ title: "Formatting: fix indentation", description: "whitespace only", evidence: "authorize removed" })],
      base
    );
    expect(findings).toHaveLength(0);
  });

  it("rejects findings that duplicate a deterministic finding", () => {
    const deterministic: Finding = {
      id: "d1",
      ruleId: "security.authorization-check-removed",
      title: "Authorization removed",
      description: "",
      severity: "high",
      category: "security",
      file: "src/auth/session.ts",
      evidence: "authorize(req)",
      recommendation: "",
      confidence: 0.6,
      source: "rule"
    };
    const { findings } = validateAIFindings([raw({})], { ...base, deterministicFindings: [deterministic] });
    expect(findings).toHaveLength(0);
  });

  it("allows the AI to return no findings", () => {
    const { findings } = validateAIFindings([], base);
    expect(findings).toHaveLength(0);
  });
});
