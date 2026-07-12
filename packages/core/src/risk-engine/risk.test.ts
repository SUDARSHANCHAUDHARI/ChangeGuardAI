import { describe, it, expect } from "vitest";
import { scoreRisk } from "./risk.js";
import { configSchema } from "../config/schema.js";
import type { ChangedFile, Finding } from "../types/domain.js";

const config = configSchema.parse({});

function file(partial: Partial<ChangedFile> & Pick<ChangedFile, "path" | "category">): ChangedFile {
  return {
    status: "modified",
    additions: 1,
    deletions: 0,
    patch: "",
    binary: false,
    ...partial
  };
}

function finding(partial: Partial<Finding> & Pick<Finding, "severity" | "category">): Finding {
  return {
    id: "x",
    title: "t",
    description: "d",
    file: "f",
    evidence: "e",
    recommendation: "r",
    confidence: 0.9,
    source: "rule",
    ...partial
  };
}

describe("scoreRisk", () => {
  it("is deterministic and returns a breakdown", () => {
    const input = {
      config,
      changedFiles: [file({ path: "src/a.ts", category: "source" })],
      findings: [finding({ severity: "high", category: "security" })]
    };
    const a = scoreRisk(input);
    const b = scoreRisk(input);
    expect(a).toEqual(b);
    expect(a.contributions.length).toBeGreaterThan(0);
    expect(a.contributions.reduce((s, c) => s + c.points, 0)).toBe(a.score);
  });

  it("scores documentation-only changes as low", () => {
    const r = scoreRisk({
      config,
      changedFiles: [file({ path: "docs/readme.md", category: "documentation" })],
      findings: []
    });
    expect(r.level).toBe("low");
    expect(r.score).toBe(0);
    expect(r.recommendation).toBe("merge");
  });

  it("scores authorization removal as high or critical", () => {
    const r = scoreRisk({
      config,
      changedFiles: [file({ path: "src/permissions/roles.ts", category: "authorization" })],
      findings: [
        finding({ severity: "high", category: "security", ruleId: "security.authorization-check-removed" }),
        finding({ severity: "medium", category: "testing", ruleId: "testing.source-changed-without-tests" })
      ]
    });
    // 20 (authz file) + 18 (high) + 8 (medium) + 15 (no tests) = 61 → high
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(["high", "critical"]).toContain(r.level);
  });

  it("caps at 100 and blocks on very high risk", () => {
    const many = Array.from({ length: 6 }, () => finding({ severity: "critical", category: "security" }));
    const r = scoreRisk({
      config,
      changedFiles: [file({ path: "src/auth/session.ts", category: "authentication" })],
      findings: many
    });
    expect(r.score).toBe(100);
    expect(r.level).toBe("critical");
    expect(r.recommendation).toBe("block");
  });
});
