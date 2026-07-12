import { inspectRepository } from "@changeguard/core";
import type { CommandContext } from "../context.js";

/** `changeguard inspect` — detect and print repository metadata. */
export async function runInspect(ctx: CommandContext): Promise<number> {
  const info = await inspectRepository(ctx.git, { baseBranch: ctx.config.baseBranch });

  if (ctx.flags.json) {
    process.stdout.write(JSON.stringify(info, null, 2) + "\n");
    return 0;
  }

  const lines: string[] = [];
  lines.push("ChangeGuard AI — Repository Inspection");
  lines.push("");
  lines.push(`Root:            ${info.root}`);
  lines.push(`Current branch:  ${info.currentBranch ?? "(detached / unknown)"}`);
  lines.push(`Base branch:     ${info.baseBranch}`);
  lines.push(`Package manager: ${info.packageManager ?? "unknown"}`);
  lines.push(`Monorepo:        ${info.monorepo ? "yes" : "no"}`);
  lines.push(`Languages:       ${fmt(info.languages)}`);
  lines.push(`Frameworks:      ${fmt(info.frameworks)}`);
  lines.push(`Test frameworks: ${fmt(info.testFrameworks)}`);
  lines.push(`API frameworks:  ${fmt(info.apiFrameworks)}`);
  lines.push(`Database tools:  ${fmt(info.databaseTools)}`);
  lines.push(`CI configured:   ${info.ciConfigured ? "yes" : "no"}`);
  lines.push(`GitHub repo:     ${info.github ? `${info.github.owner}/${info.github.name}` : "(not detected)"}`);
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

function fmt(items: string[]): string {
  return items.length === 0 ? "(none detected)" : items.join(", ");
}
