import type {
  ChangedFile,
  Finding,
  TestCategory,
  TestPlan,
  TestPriority,
  TestScenario
} from "../types/domain.js";

export interface TestPlanInput {
  changedFiles: ChangedFile[];
  findings: Finding[];
}

function stableId(prefix: string, basis: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i += 1) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${prefix}-${(h >>> 0).toString(36).slice(0, 6)}`;
}

function filesByCategory(files: ChangedFile[], category: ChangedFile["category"]): string[] {
  return files.filter((f) => f.category === category).map((f) => f.path);
}

/**
 * Build a deterministic test plan from changed files and findings — no AI. The
 * same input always yields the same scenarios (used by golden tests). The plan
 * is a starting point for a human, not a guarantee of coverage.
 */
export function generateTestPlan(input: TestPlanInput): TestPlan {
  const { changedFiles, findings } = input;
  const scenarios: TestScenario[] = [];
  const push = (
    prefix: string,
    title: string,
    priority: TestPriority,
    category: TestCategory,
    fields: Partial<Omit<TestScenario, "id" | "title" | "priority" | "category">>
  ): void => {
    scenarios.push({
      id: stableId(prefix, `${title}|${(fields.relatedFiles ?? []).join(",")}`),
      title,
      priority,
      category,
      preconditions: fields.preconditions ?? [],
      steps: fields.steps ?? [],
      expectedResults: fields.expectedResults ?? [],
      relatedFiles: fields.relatedFiles ?? [],
      relatedFindings: fields.relatedFindings ?? []
    });
  };

  const nonDocFiles = changedFiles.filter((f) => f.category !== "documentation" && f.category !== "generated");

  // Always a smoke scenario when there is functional change.
  if (nonDocFiles.length > 0) {
    push("smoke", "Application builds and boots after the change", "high", "smoke", {
      steps: ["Build the project", "Start the app / run the affected entrypoint"],
      expectedResults: ["Build succeeds", "No startup errors in the changed areas"],
      relatedFiles: nonDocFiles.slice(0, 10).map((f) => f.path)
    });
  }

  // Auth.
  const authFiles = [...filesByCategory(changedFiles, "authentication"), ...filesByCategory(changedFiles, "authorization")];
  if (authFiles.length > 0) {
    push("neg-auth", "Access is denied for unauthenticated and unauthorized requests", "critical", "negative", {
      preconditions: ["A user without the required session/role"],
      steps: ["Call the protected path without auth", "Call it with an insufficient role"],
      expectedResults: ["401 for unauthenticated", "403 for unauthorized"],
      relatedFiles: authFiles,
      relatedFindings: relatedFindingIds(findings, ["security", "testing"], authFiles)
    });
  }

  // API.
  const apiFiles = filesByCategory(changedFiles, "api");
  if (apiFiles.length > 0) {
    push("api-contract", "API contract: status codes and response shapes unchanged (or intended)", "high", "compatibility", {
      steps: ["Exercise each changed endpoint", "Compare status codes and response schema against the previous contract"],
      expectedResults: ["Only intended contract changes are observed"],
      relatedFiles: apiFiles,
      relatedFindings: relatedFindingIds(findings, ["compatibility"], apiFiles)
    });
  }

  // Database / migration.
  const migrationFiles = filesByCategory(changedFiles, "migration");
  if (migrationFiles.length > 0) {
    push("db-migrate", "Migration applies cleanly on production-like data", "critical", "database-migration", {
      preconditions: ["A database seeded with representative data"],
      steps: ["Run the migration up", "Verify row counts and constraints"],
      expectedResults: ["Migration completes without data loss", "Constraints hold"],
      relatedFiles: migrationFiles,
      relatedFindings: relatedFindingIds(findings, ["database"], migrationFiles)
    });
    push("db-rollback", "Migration rollback restores the prior schema", "high", "rollback", {
      steps: ["Run the migration down", "Verify schema matches the pre-migration state"],
      expectedResults: ["Down migration succeeds", "No orphaned objects remain"],
      relatedFiles: migrationFiles
    });
  }

  // Security findings → explicit security scenario.
  const securityFindings = findings.filter((f) => f.category === "security");
  if (securityFindings.length > 0) {
    push("sec", "Security: verify each flagged risk is mitigated", "critical", "security", {
      steps: securityFindings.slice(0, 8).map((f) => `Verify: ${f.title} (${f.file})`),
      expectedResults: ["Each flagged risk is either a false positive or mitigated with a test"],
      relatedFiles: [...new Set(securityFindings.map((f) => f.file))],
      relatedFindings: securityFindings.map((f) => f.id)
    });
  }

  // Reliability findings → regression scenario.
  const reliabilityFindings = findings.filter((f) => f.category === "reliability");
  if (reliabilityFindings.length > 0) {
    push("reg", "Regression: error, timeout, and retry paths behave as before", "high", "regression", {
      steps: ["Force downstream failures/timeouts", "Observe error handling and recovery"],
      expectedResults: ["Failures are handled; no silent swallow or hang"],
      relatedFiles: [...new Set(reliabilityFindings.map((f) => f.file))],
      relatedFindings: reliabilityFindings.map((f) => f.id)
    });
  }

  const regressionAreas = [...new Set(nonDocFiles.map((f) => topDir(f.path)))].slice(0, 12);

  const assumptions: string[] = [];
  const unknowns: string[] = [];

  if (findings.some((f) => f.category === "testing")) {
    unknowns.push("Test coverage gaps were detected — see testing.* findings.");
  }
  if (changedFiles.some((f) => f.binary)) {
    unknowns.push("Binary files changed and could not be inspected line-by-line.");
  }
  assumptions.push("Scenarios are derived from a textual diff and deterministic rules, not full program analysis.");

  return {
    summary: buildSummary(changedFiles, findings),
    scenarios,
    regressionAreas,
    assumptions,
    unknowns
  };
}

function relatedFindingIds(findings: Finding[], categories: string[], files: string[]): string[] {
  return findings
    .filter((f) => categories.includes(f.category) && files.includes(f.file))
    .map((f) => f.id);
}

function topDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? `${parts[0]}/` : path;
}

function buildSummary(files: ChangedFile[], findings: Finding[]): string {
  if (files.length === 0) return "No changes to test.";
  const cats = new Set(files.map((f) => f.category));
  const areas = [...cats].join(", ");
  return `${files.length} file(s) changed across: ${areas}. ${findings.length} finding(s) inform the scenarios below.`;
}
