import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchPullRequest, inspectRepository, type DiffSource } from "@changeguard/core";
import type { CommandContext } from "./context.js";

export interface SourceOptions {
  base?: string;
  head?: string;
  commits?: string;
  diff?: string;
  staged?: boolean;
  working?: boolean;
  pr?: string;
}

export interface ResolvedSource {
  source: DiffSource;
  /** PR title/body, when the source is a GitHub PR — passed to the AI context. */
  prTitle?: string;
  prBody?: string;
}

/**
 * Map CLI diff-selection options to a core DiffSource. Precedence:
 *   --pr > --diff (patch) > --commits > --staged > --working > --base/--head
 * The default is `<baseBranch>...HEAD`, i.e. `git diff main...HEAD`.
 */
export async function resolveSourceEx(ctx: CommandContext, options: SourceOptions): Promise<ResolvedSource> {
  if (options.pr !== undefined) {
    return resolvePr(ctx, options.pr);
  }
  if (options.diff !== undefined) {
    const path = resolve(ctx.cwd, options.diff);
    const content = await readFile(path, "utf8");
    return { source: { kind: "patch", content } };
  }
  if (options.commits !== undefined) {
    return { source: { kind: "commits", range: options.commits } };
  }
  if (options.staged === true) {
    return { source: { kind: "staged" } };
  }
  if (options.working === true) {
    return { source: { kind: "working" } };
  }
  const base = options.base ?? ctx.config.baseBranch;
  const head = options.head ?? "HEAD";
  return { source: { kind: "range", base, head } };
}

/** Backwards-compatible helper returning just the DiffSource. */
export async function resolveSource(ctx: CommandContext, options: SourceOptions): Promise<DiffSource> {
  return (await resolveSourceEx(ctx, options)).source;
}

async function resolvePr(ctx: CommandContext, prArg: string): Promise<ResolvedSource> {
  const number = Number.parseInt(prArg, 10);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Invalid --pr value: ${prArg}`);
  }
  const info = await inspectRepository(ctx.git, { baseBranch: ctx.config.baseBranch });
  if (info.github === undefined) {
    throw new Error("Could not determine the GitHub owner/repo from the origin remote.");
  }
  const pr = await fetchPullRequest(process.env["GITHUB_TOKEN"], {
    owner: info.github.owner,
    repo: info.github.name,
    number
  });
  return {
    source: { kind: "prefetched", files: pr.files, description: `PR #${number} (${pr.headRef} → ${pr.baseRef})` },
    prTitle: pr.title,
    prBody: pr.body
  };
}
