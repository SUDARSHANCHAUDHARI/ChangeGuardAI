import type { TestPlan } from "../types/domain.js";

/** Deterministic Markdown rendering of a test plan. */
export function renderTestPlanMarkdown(plan: TestPlan): string {
  const s: string[] = [];
  s.push("# ChangeGuard AI — Recommended Test Plan");
  s.push("");
  s.push(plan.summary.trim().length > 0 ? plan.summary : "_No test plan generated._");
  s.push("");

  if (plan.scenarios.length > 0) {
    s.push("## Scenarios");
    s.push("");
    for (const sc of plan.scenarios) {
      s.push(`### [${sc.priority}] ${sc.title}`);
      s.push("");
      s.push(`- Category: ${sc.category}`);
      if (sc.relatedFiles.length > 0) s.push(`- Related files: ${sc.relatedFiles.join(", ")}`);
      if (sc.relatedFindings.length > 0) s.push(`- Related findings: ${sc.relatedFindings.join(", ")}`);
      if (sc.preconditions.length > 0) {
        s.push("- Preconditions:");
        for (const p of sc.preconditions) s.push(`  - ${p}`);
      }
      if (sc.steps.length > 0) {
        s.push("- Steps:");
        sc.steps.forEach((step, i) => s.push(`  ${i + 1}. ${step}`));
      }
      if (sc.expectedResults.length > 0) {
        s.push("- Expected:");
        for (const e of sc.expectedResults) s.push(`  - ${e}`);
      }
      s.push("");
    }
  }

  if (plan.regressionAreas.length > 0) {
    s.push("## Regression Areas");
    s.push("");
    for (const area of plan.regressionAreas) s.push(`- ${area}`);
    s.push("");
  }

  if (plan.assumptions.length > 0) {
    s.push("## Assumptions");
    s.push("");
    for (const a of plan.assumptions) s.push(`- ${a}`);
    s.push("");
  }

  if (plan.unknowns.length > 0) {
    s.push("## Unknowns");
    s.push("");
    for (const u of plan.unknowns) s.push(`- ${u}`);
    s.push("");
  }

  return s.join("\n");
}
