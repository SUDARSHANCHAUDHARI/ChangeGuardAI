import { writeAnalysisOutput, renderMarkdownReport } from "@changeguard/core";
import type { CommandContext } from "../context.js";
import { runAnalysis, computeExitCode, type AnalyzeCliOptions } from "../run-analysis.js";
import { printRiskSummary } from "../render.js";

export interface AnalyzeOptions extends AnalyzeCliOptions {
  format?: "markdown" | "json" | "human";
  ai?: boolean;
  write?: boolean;
}

/** `changeguard analyze` — full analysis, report generation, and exit code. */
export async function runAnalyze(ctx: CommandContext, options: AnalyzeOptions): Promise<number> {
  const run = await runAnalysis(ctx, options);
  const { result } = run;

  if (options.write !== false) {
    const written = await writeAnalysisOutput(result, {
      dir: run.outputDir,
      markdown: ctx.config.output.markdown,
      json: ctx.config.output.json
    });
    ctx.logger.debug({ paths: written.paths }, "wrote analysis output");
  }

  const format = options.format ?? (ctx.flags.json ? "json" : "human");
  if (format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (format === "markdown") {
    process.stdout.write(renderMarkdownReport(result) + "\n");
  } else {
    printRiskSummary(result);
    if (options.write !== false) {
      process.stdout.write(`\nReports written to ${ctx.config.output.dir}/\n`);
    }
  }

  return computeExitCode(run, ctx.config, options.failOn);
}
