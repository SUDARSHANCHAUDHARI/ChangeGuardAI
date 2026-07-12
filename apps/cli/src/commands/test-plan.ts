import { renderTestPlanMarkdown } from "@changeguard/core";
import type { CommandContext } from "../context.js";
import { runAnalysis, type AnalyzeCliOptions } from "../run-analysis.js";

/** `changeguard test-plan` — generate and print the deterministic test plan. */
export async function runTestPlan(ctx: CommandContext, options: AnalyzeCliOptions): Promise<number> {
  const run = await runAnalysis(ctx, options);
  if (ctx.flags.json) {
    process.stdout.write(JSON.stringify(run.result.testPlan, null, 2) + "\n");
  } else {
    process.stdout.write(renderTestPlanMarkdown(run.result.testPlan) + "\n");
  }
  return 0;
}
