import { describe, it, expect } from "vitest";
import { runRules, getRuleById } from "./registry.js";
import { configSchema } from "../config/schema.js";
import type { ChangedFile, FileCategory, RepositoryInfo } from "../types/domain.js";
import type { RuleContext } from "./types.js";

const config = configSchema.parse({});
const repository: RepositoryInfo = {
  root: "/repo",
  baseBranch: "main",
  languages: ["typescript"],
  frameworks: [],
  testFrameworks: [],
  monorepo: false,
  databaseTools: [],
  apiFrameworks: [],
  ciConfigured: false
};

function mkFile(
  path: string,
  category: FileCategory,
  patch: string,
  extra: Partial<ChangedFile> = {}
): ChangedFile {
  return {
    path,
    category,
    status: "modified",
    additions: 1,
    deletions: 0,
    patch,
    binary: false,
    language: "typescript",
    ...extra
  };
}

async function runOne(ruleId: string, files: ChangedFile[]) {
  const rule = getRuleById(ruleId);
  if (rule === undefined) throw new Error(`no rule ${ruleId}`);
  const ctx: RuleContext = { files, repository, config };
  const { findings } = await runRules(ctx, [rule]);
  return findings;
}

describe("deterministic rules", () => {
  it("flags authorization check removal", async () => {
    const patch = `@@ -1,3 +1,2 @@\n function handler() {\n-  authorize(req);\n   doThing();`;
    const findings = await runOne("security.authorization-check-removed", [
      mkFile("src/permissions/roles.ts", "authorization", patch)
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toContain("authorize");
    expect(findings[0]?.severity).toBe("high");
  });

  it("flags a secret-like value added", async () => {
    const patch = `@@ -0,0 +1 @@\n+const apiKey = "sk_live_abcdef0123456789ABCDEF";`;
    const findings = await runOne("security.secret-like-value-added", [
      mkFile("src/config.ts", "source", patch, { status: "added" })
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("critical");
    expect(findings[0]?.startLine).toBe(1);
  });

  it("flags a destructive migration", async () => {
    const patch = `@@ -0,0 +1 @@\n+DROP TABLE users;`;
    const findings = await runOne("database.destructive-migration", [
      mkFile("db/migrations/002_drop.sql", "migration", patch, { status: "added", language: "sql" })
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toContain("DROP TABLE");
  });

  it("flags expanded GitHub workflow permissions", async () => {
    const patch = `@@ -1 +1,2 @@\n name: ci\n+permissions: write-all`;
    const findings = await runOne("security.github-workflow-permissions-expanded", [
      mkFile(".github/workflows/ci.yml", "ci", patch, { language: "yaml" })
    ]);
    expect(findings).toHaveLength(1);
  });

  it("flags real command execution but not regex .exec()", async () => {
    const realExec = `@@ -0,0 +1,2 @@\n+import { execSync } from "child_process";\n+execSync(cmd);`;
    const hits = await runOne("security.command-execution-added", [mkFile("src/run.ts", "source", realExec)]);
    expect(hits.length).toBeGreaterThanOrEqual(1);

    // Method calls like regex.exec() must NOT be flagged as command execution.
    const regexExec = `@@ -0,0 +1 @@\n+const m = ROUTE_RE.exec(line);`;
    const noHits = await runOne("security.command-execution-added", [mkFile("src/parse.ts", "source", regexExec)]);
    expect(noHits).toHaveLength(0);
  });

  it("does not flag command execution in test files", async () => {
    // Tests legitimately spawn processes (found via dogfooding on a real repo).
    const patch = `@@ -0,0 +1 @@\n+execFileSync("git", ["init"], { cwd });`;
    const inTest = await runOne("security.command-execution-added", [
      mkFile("tests/setup.test.mjs", "test", patch)
    ]);
    expect(inTest).toHaveLength(0);
    // …but the same call in production source is still flagged.
    const inSrc = await runOne("security.command-execution-added", [mkFile("src/runner.ts", "source", patch)]);
    expect(inSrc).toHaveLength(1);
  });

  it("flags source changed without tests", async () => {
    const patch = `@@ -0,0 +1 @@\n+export const x = 1;`;
    const findings = await runOne("testing.source-changed-without-tests", [
      mkFile("src/a.ts", "source", patch)
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe("testing");
  });

  it("does NOT flag source-without-tests when a test file changed", async () => {
    const src = mkFile("src/a.ts", "source", `@@ -0,0 +1 @@\n+export const x = 1;`);
    const test = mkFile("src/a.test.ts", "test", `@@ -0,0 +1 @@\n+it("works", () => {});`);
    const findings = await runOne("testing.source-changed-without-tests", [src, test]);
    expect(findings).toHaveLength(0);
  });

  it("does not throw on binary files", async () => {
    const findings = await runOne("security.secret-like-value-added", [
      mkFile("logo.png", "generated", "", { binary: true })
    ]);
    expect(findings).toHaveLength(0);
  });
});
