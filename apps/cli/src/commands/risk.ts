import type { CommandContext } from "../context.js";
import { runAnalysis, computeExitCode, type AnalyzeCliOptions } from "../run-analysis.js";
import { printRiskSummary } from "../render.js";

/** `changeguard risk` — compute and print only the risk score/breakdown. */
export async function runRisk(ctx: CommandContext, options: AnalyzeCliOptions): Promise<number> {
  const run = await runAnalysis(ctx, options);
  if (ctx.flags.json) {
    process.stdout.write(JSON.stringify(run.result.risk, null, 2) + "\n");
  } else {
    printRiskSummary(run.result);
  }
  return computeExitCode(run, ctx.config, options.failOn);
}
