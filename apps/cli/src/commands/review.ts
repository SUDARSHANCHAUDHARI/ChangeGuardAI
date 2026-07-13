import { renderPrComment, postPrComment, inspectRepository } from "@changeguard/core";
import type { CommandContext } from "../context.js";
import { runAnalysis, computeExitCode, type AnalyzeCliOptions } from "../run-analysis.js";

export interface ReviewOptions extends AnalyzeCliOptions {
  /** Set true by `--post` to actually create/update the PR comment. */
  post?: boolean;
}

/**
 * `changeguard review` — analyze a GitHub pull request and produce a review
 * summary comment. By default this is a DRY RUN that only prints the comment.
 * Pass `--post` to create or update the single sticky comment on the PR (the
 * only GitHub write ChangeGuard performs).
 */
export async function runReview(ctx: CommandContext, options: ReviewOptions): Promise<number> {
  // Posting targets a specific PR; a dry-run preview works on any diff source.
  if (options.post === true && options.pr === undefined) {
    process.stderr.write("review --post requires --pr <number>.\n");
    return 1;
  }

  const run = await runAnalysis(ctx, options);
  const body = renderPrComment(run.result);

  if (options.post !== true) {
    process.stdout.write(body + "\n");
    process.stdout.write("\n(dry run — pass --post with --pr to publish this comment)\n");
    return computeExitCode(run, ctx.config, options.failOn);
  }

  const number = Number.parseInt(options.pr as string, 10);
  const info = await inspectRepository(ctx.git, { baseBranch: ctx.config.baseBranch });
  if (info.github === undefined) {
    process.stderr.write("Could not determine the GitHub owner/repo from the origin remote.\n");
    return 1;
  }

  const posted = await postPrComment(process.env["GITHUB_TOKEN"], {
    owner: info.github.owner,
    repo: info.github.name,
    number
  }, body);

  process.stdout.write(`${posted.action === "created" ? "Posted" : "Updated"} review comment: ${posted.url}\n`);
  return computeExitCode(run, ctx.config, options.failOn);
}
