import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { collectFromPatch } from "./git/sources.js";
import { normalizeFiles } from "./analyzer/normalize.js";
import { runRules } from "./rules/registry.js";
import { dedupeFindings } from "./analyzer/dedupe.js";
import { scoreRisk } from "./risk-engine/risk.js";
import { generateTestPlan } from "./test-plan/generate.js";
import { renderMarkdownReport } from "./reporters/markdown.js";
import { configSchema } from "./config/schema.js";
import type { AnalysisResult, RepositoryInfo, RiskLevel } from "./types/domain.js";

const config = configSchema.parse({});
const repository: RepositoryInfo = {
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
};

const FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const LEVEL_RANK: Record<RiskLevel, number> = { low: 0, moderate: 1, high: 2, critical: 3 };

interface Expected {
  expectRuleIds: string[];
  forbidRuleIds?: string[];
  riskLevelAtLeast?: RiskLevel;
  riskLevelAtMost?: RiskLevel;
}

async function analyzePatch(patch: string): Promise<AnalysisResult> {
  const collected = collectFromPatch(patch);
  const changedFiles = normalizeFiles(collected.files, {
    include: config.include,
    exclude: config.exclude,
    classify: config.classify
  });
  const { findings: ruleFindings } = await runRules({ files: changedFiles, repository, config });
  const findings = dedupeFindings(ruleFindings);
  const risk = scoreRisk({ findings, changedFiles, config });
  const testPlan = generateTestPlan({ changedFiles, findings });
  return {
    repository,
    changedFiles,
    findings,
    affectedAreas: [...new Set(changedFiles.map((f) => f.category))],
    risk,
    testPlan,
    generatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function fixtureNames(): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

describe("fixtures", () => {
  for (const name of fixtureNames()) {
    const dir = join(FIXTURES_DIR, name);
    const expectedPath = join(dir, "expected.json");
    const patchPath = join(dir, "change.patch");
    if (!existsSync(expectedPath) || !existsSync(patchPath)) continue;

    it(`analyzes fixture: ${name}`, async () => {
      const patch = readFileSync(patchPath, "utf8");
      const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Expected;
      const result = await analyzePatch(patch);
      const firedRuleIds = new Set(result.findings.map((f) => f.ruleId).filter((id): id is string => id !== undefined));

      for (const id of expected.expectRuleIds) {
        expect(firedRuleIds, `expected rule ${id} to fire`).toContain(id);
      }
      for (const id of expected.forbidRuleIds ?? []) {
        expect(firedRuleIds, `rule ${id} must not fire`).not.toContain(id);
      }
      if (expected.riskLevelAtLeast !== undefined) {
        expect(LEVEL_RANK[result.risk.level]).toBeGreaterThanOrEqual(LEVEL_RANK[expected.riskLevelAtLeast]);
      }
      if (expected.riskLevelAtMost !== undefined) {
        expect(LEVEL_RANK[result.risk.level]).toBeLessThanOrEqual(LEVEL_RANK[expected.riskLevelAtMost]);
      }

      // Every finding must have evidence and a file path.
      for (const f of result.findings) {
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.file.length).toBeGreaterThan(0);
      }
    });
  }

  it("golden Markdown report for authorization-removed is stable", async () => {
    const patch = readFileSync(join(FIXTURES_DIR, "authorization-removed", "change.patch"), "utf8");
    const md = renderMarkdownReport(await analyzePatch(patch));
    expect(md).toMatchSnapshot();
  });
});
