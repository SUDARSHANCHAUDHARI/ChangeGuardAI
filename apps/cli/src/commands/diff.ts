import { collectDiff, normalizeFiles, type ChangedFile } from "@changeguard/core";
import type { CommandContext } from "../context.js";
import { resolveSource, type SourceOptions } from "../resolve-source.js";

/** `changeguard diff` — collect and classify changed files, no scoring. */
export async function runDiff(ctx: CommandContext, options: SourceOptions): Promise<number> {
  const source = await resolveSource(ctx, options);
  const collected = await collectDiff(ctx.git, source);
  const files = normalizeFiles(collected.files, {
    include: ctx.config.include,
    exclude: ctx.config.exclude,
    classify: ctx.config.classify
  });

  if (ctx.flags.json) {
    process.stdout.write(JSON.stringify(files, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`ChangeGuard AI — Diff (${collected.description})\n\n`);
  if (files.length === 0) {
    process.stdout.write("No changed files after filtering.\n");
    return 0;
  }
  for (const f of files) render(f);
  process.stdout.write(`\n${files.length} file(s).\n`);
  return 0;
}

function render(f: ChangedFile): void {
  const name = f.previousPath !== undefined ? `${f.previousPath} → ${f.path}` : f.path;
  const flags = f.binary ? " [binary]" : "";
  const status = f.status.padEnd(8);
  const counts = `+${f.additions}/−${f.deletions}`.padEnd(12);
  process.stdout.write(`  ${status} ${f.category.padEnd(15)} ${counts} ${name}${flags}\n`);
}
