import { describe, it, expect } from "vitest";
import { dedupeFindings } from "./dedupe.js";
import type { Finding } from "../types/domain.js";

function f(partial: Partial<Finding>): Finding {
  return {
    id: "id",
    title: "Authorization check removed",
    description: "desc",
    severity: "high",
    category: "security",
    file: "src/a.ts",
    startLine: 10,
    evidence: "authorize(req)",
    recommendation: "rec",
    confidence: 0.5,
    source: "rule",
    ...partial
  };
}

describe("dedupeFindings", () => {
  it("collapses duplicate rule findings", () => {
    const out = dedupeFindings([f({ ruleId: "r1" }), f({ ruleId: "r1" })]);
    expect(out).toHaveLength(1);
  });

  it("keeps the deterministic finding over an AI duplicate and merges context", () => {
    const rule = f({ ruleId: "r1", source: "rule", confidence: 0.6 });
    const ai = f({ ruleId: "r1", source: "ai", confidence: 0.9, description: "AI extra detail" });
    const out = dedupeFindings([ai, rule]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe("rule");
    expect(out[0]?.confidence).toBe(0.9);
    expect(out[0]?.description).toContain("AI context");
  });

  it("keeps distinct findings on different files", () => {
    const out = dedupeFindings([f({ ruleId: "r1", file: "a.ts" }), f({ ruleId: "r1", file: "b.ts" })]);
    expect(out).toHaveLength(2);
  });
});
