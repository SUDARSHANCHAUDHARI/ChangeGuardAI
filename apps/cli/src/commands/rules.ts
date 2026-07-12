import {
  allRules,
  getRuleById,
  runRules,
  collectDiff,
  normalizeFiles,
  inspectRepository
} from "@changeguard/core";
import type { CommandContext } from "../context.js";
import { resolveSource, type SourceOptions } from "../resolve-source.js";

/** `changeguard rules list` — list all built-in rules. */
export async function runRulesList(ctx: CommandContext): Promise<number> {
  if (ctx.flags.json) {
    const json = allRules.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      defaultSeverity: r.defaultSeverity,
      description: r.description,
      limitations: r.limitations
    }));
    process.stdout.write(JSON.stringify(json, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`ChangeGuard AI — ${allRules.length} rules\n\n`);
  let lastCategory = "";
  for (const r of allRules) {
    if (r.category !== lastCategory) {
      process.stdout.write(`\n${r.category.toUpperCase()}\n`);
      lastCategory = r.category;
    }
    process.stdout.write(`  ${r.id.padEnd(48)} [${r.defaultSeverity}] ${r.name}\n`);
  }
  return 0;
}

export interface RulesTestOptions extends SourceOptions {
  rule?: string;
}

/**
 * `changeguard rules test` — run rules against the resolved diff and show which
 * fire. Pass --rule <id> to test a single rule. Useful for authoring/debugging.
 */
export async function runRulesTest(ctx: CommandContext, options: RulesTestOptions): Promise<number> {
  const rules = options.rule !== undefined ? [getRuleById(options.rule)].filter((r) => r !== undefined) : allRules;
  if (options.rule !== undefined && rules.length === 0) {
    process.stderr.write(`Unknown rule: ${options.rule}\n`);
    return 1;
  }

  const source = await resolveSource(ctx, options);
  const collected = await collectDiff(ctx.git, source);
  const files = normalizeFiles(collected.files, {
    include: ctx.config.include,
    exclude: ctx.config.exclude,
    classify: ctx.config.classify
  });
  const repository = await inspectRepository(ctx.git, { baseBranch: ctx.config.baseBranch });

  const { findings, errors } = await runRules({ files, repository, config: ctx.config }, rules);

  if (ctx.flags.json) {
    process.stdout.write(JSON.stringify({ findings, errors }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`Tested ${rules.length} rule(s) against ${files.length} file(s).\n\n`);
  if (findings.length === 0) {
    process.stdout.write("No findings.\n");
  }
  for (const f of findings) {
    const loc = f.startLine !== undefined ? `${f.file}:${f.startLine}` : f.file;
    process.stdout.write(`[${f.severity}] ${f.ruleId} — ${loc}\n  ${f.evidence.split("\n")[0]}\n`);
  }
  for (const e of errors) process.stderr.write(`rule error ${e.ruleId}: ${e.message}\n`);
  return 0;
}
