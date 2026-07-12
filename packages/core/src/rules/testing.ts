import type { ChangedFile, FileCategory } from "../types/domain.js";
import type { ChangeGuardRule, RuleContext } from "./types.js";
import { makeFinding } from "./types.js";
import { addedText } from "./patch.js";

const SOURCE_LIKE: FileCategory[] = ["source", "api", "authentication", "authorization", "database"];

function isTestFile(f: ChangedFile): boolean {
  return f.category === "test";
}
function isSnapshot(f: ChangedFile): boolean {
  return f.path.endsWith(".snap");
}
function changedTestFiles(ctx: RuleContext): ChangedFile[] {
  return ctx.files.filter(isTestFile);
}
function changedOf(ctx: RuleContext, category: FileCategory): ChangedFile[] {
  return ctx.files.filter((f) => f.category === category && f.status !== "deleted");
}

const LIMIT_TESTS =
  "Detects the presence/absence of changed test files by classification. It cannot verify that a changed test actually exercises the changed code.";

export const testingRules: ChangeGuardRule[] = [
  {
    id: "testing.source-changed-without-tests",
    name: "Source changed without tests",
    description: "Source code changed but no test files were added or modified.",
    category: "testing",
    defaultSeverity: "medium",
    limitations: LIMIT_TESTS,
    async evaluate(ctx) {
      const sourceFiles = ctx.files.filter((f) => SOURCE_LIKE.includes(f.category) && f.status !== "deleted");
      if (sourceFiles.length === 0) return [];
      if (changedTestFiles(ctx).length > 0) return [];
      const target = sourceFiles[0];
      if (target === undefined) return [];
      return [
        makeFinding({
          ruleId: "testing.source-changed-without-tests",
          title: "Source changed without tests",
          description: `${sourceFiles.length} source file(s) changed but no test files were added or modified.`,
          severity: "medium",
          category: "testing",
          file: target.path,
          evidence: sourceFiles.slice(0, 8).map((f) => f.path).join("\n"),
          recommendation: "Add or update tests covering the changed behavior.",
          confidence: 0.8
        })
      ];
    }
  },
  {
    id: "testing.auth-change-without-negative-tests",
    name: "Auth change without negative tests",
    description: "Authentication/authorization code changed without added negative-path tests.",
    category: "testing",
    defaultSeverity: "high",
    limitations: LIMIT_TESTS,
    async evaluate(ctx) {
      const authFiles = ctx.files.filter(
        (f) => (f.category === "authentication" || f.category === "authorization") && f.status !== "deleted"
      );
      if (authFiles.length === 0) return [];
      const negativeCovered = changedTestFiles(ctx).some((t) =>
        /(unauthori[sz]ed|forbidden|401|403|denied|reject|invalid token|no permission)/i.test(addedText(t.patch))
      );
      if (negativeCovered) return [];
      const target = authFiles[0];
      if (target === undefined) return [];
      return [
        makeFinding({
          ruleId: "testing.auth-change-without-negative-tests",
          title: "Auth change without negative tests",
          description: "Auth-related code changed but no test asserts the denied/unauthorized path.",
          severity: "high",
          category: "testing",
          file: target.path,
          evidence: authFiles.map((f) => f.path).join("\n"),
          recommendation: "Add negative tests asserting 401/403 and denied-permission behavior.",
          confidence: 0.7
        })
      ];
    }
  },
  {
    id: "testing.api-change-without-contract-tests",
    name: "API change without contract tests",
    description: "API code changed but no test files were added or modified.",
    category: "testing",
    defaultSeverity: "medium",
    limitations: LIMIT_TESTS,
    async evaluate(ctx) {
      const apiFiles = changedOf(ctx, "api");
      if (apiFiles.length === 0 || changedTestFiles(ctx).length > 0) return [];
      const target = apiFiles[0];
      if (target === undefined) return [];
      return [
        makeFinding({
          ruleId: "testing.api-change-without-contract-tests",
          title: "API change without contract tests",
          description: "API routes/handlers changed but no request/response contract tests changed.",
          severity: "medium",
          category: "testing",
          file: target.path,
          evidence: apiFiles.map((f) => f.path).join("\n"),
          recommendation: "Add contract tests covering status codes and response shapes.",
          confidence: 0.65
        })
      ];
    }
  },
  {
    id: "testing.migration-without-tests",
    name: "Migration without tests",
    description: "A database migration changed but no tests were added or modified.",
    category: "testing",
    defaultSeverity: "medium",
    limitations: LIMIT_TESTS,
    async evaluate(ctx) {
      const migrations = changedOf(ctx, "migration");
      if (migrations.length === 0 || changedTestFiles(ctx).length > 0) return [];
      const target = migrations[0];
      if (target === undefined) return [];
      return [
        makeFinding({
          ruleId: "testing.migration-without-tests",
          title: "Migration without tests",
          description: "A migration changed but no migration/data test was added or modified.",
          severity: "medium",
          category: "testing",
          file: target.path,
          evidence: migrations.map((f) => f.path).join("\n"),
          recommendation: "Add a migration test verifying up/down and data integrity.",
          confidence: 0.65
        })
      ];
    }
  },
  {
    id: "testing.snapshot-only-update",
    name: "Snapshot-only test update",
    description: "Source changed and the only test changes are snapshot files.",
    category: "testing",
    defaultSeverity: "low",
    limitations:
      "Detects when every changed test file is a snapshot. Snapshot churn can be legitimate, so this is low-confidence.",
    async evaluate(ctx) {
      const tests = changedTestFiles(ctx);
      const sourceChanged = ctx.files.some((f) => SOURCE_LIKE.includes(f.category) && f.status !== "deleted");
      if (!sourceChanged || tests.length === 0) return [];
      if (!tests.every(isSnapshot)) return [];
      const target = tests[0];
      if (target === undefined) return [];
      return [
        makeFinding({
          ruleId: "testing.snapshot-only-update",
          title: "Snapshot-only test update",
          description: "The only test changes are snapshot updates; behavior may not be meaningfully tested.",
          severity: "low",
          category: "testing",
          file: target.path,
          evidence: tests.map((f) => f.path).join("\n"),
          recommendation: "Add assertion-based tests in addition to snapshot updates.",
          confidence: 0.5
        })
      ];
    }
  },
  {
    id: "testing.bug-fix-without-regression-test",
    name: "Bug fix without regression test",
    description: "A change describing a bug fix has no corresponding test change.",
    category: "testing",
    defaultSeverity: "medium",
    limitations:
      "Infers 'bug fix' from fix-related keywords on added lines (comments/messages). Without commit metadata this is low-signal and may miss or over-flag.",
    async evaluate(ctx) {
      if (changedTestFiles(ctx).length > 0) return [];
      const fixFile = ctx.files.find(
        (f) =>
          f.status !== "deleted" &&
          SOURCE_LIKE.includes(f.category) &&
          /\b(fix(es|ed)?|bug|regression|hotfix|patch)\b/i.test(addedText(f.patch))
      );
      if (fixFile === undefined) return [];
      return [
        makeFinding({
          ruleId: "testing.bug-fix-without-regression-test",
          title: "Bug fix without regression test",
          description: "This change looks like a bug fix but adds no regression test.",
          severity: "medium",
          category: "testing",
          file: fixFile.path,
          evidence: "Fix-related keyword found in added lines; no test file changed.",
          recommendation: "Add a regression test that fails without the fix and passes with it.",
          confidence: 0.4
        })
      ];
    }
  }
];
