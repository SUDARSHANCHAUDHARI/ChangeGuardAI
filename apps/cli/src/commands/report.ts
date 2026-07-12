import { writeAnalysisOutput } from "@changeguard/core";
import type { CommandContext } from "../context.js";
import { runAnalysis, computeExitCode, type AnalyzeCliOptions } from "../run-analysis.js";

/** `changeguard report` — write the full report set to the output directory. */
export async function runReport(ctx: CommandContext, options: AnalyzeCliOptions): Promise<number> {
  const run = await runAnalysis(ctx, options);
  const written = await writeAnalysisOutput(run.result, {
    dir: run.outputDir,
    markdown: ctx.config.output.markdown,
    json: ctx.config.output.json
  });

  if (ctx.flags.json) {
    process.stdout.write(JSON.stringify({ dir: written.dir, files: written.paths }, null, 2) + "\n");
  } else {
    process.stdout.write(`Wrote ${written.paths.length} file(s) to ${written.dir}:\n`);
    for (const p of written.paths) process.stdout.write(`  ${p}\n`);
  }
  return computeExitCode(run, ctx.config, options.failOn);
}
