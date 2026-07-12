import { writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "../context.js";

const CONFIG_FILENAME = "changeguard.config.ts";

const CONFIG_TEMPLATE = `import { defineConfig } from "@changeguard/core";

export default defineConfig({
  baseBranch: "main",

  include: [],
  exclude: ["**/dist/**", "**/*.snap", "**/generated/**"],

  sensitivePaths: [
    { pattern: "src/auth/**", risk: 20, category: "authentication" },
    { pattern: "prisma/migrations/**", risk: 15, category: "database" },
    { pattern: ".github/workflows/**", risk: 12, category: "ci" }
  ],

  risk: {
    warnThreshold: 40,
    failThreshold: 70
  },

  ai: {
    enabled: false,
    provider: "ollama",
    minimumConfidence: 0.7
  }
});
`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** `changeguard init` — scaffold a config and ensure .changeguard is ignored. */
export async function runInit(ctx: CommandContext): Promise<number> {
  const root = await ctx.git.repoRoot().catch(() => ctx.cwd);
  const configPath = join(root, CONFIG_FILENAME);

  if (await exists(configPath)) {
    process.stdout.write(`✔ ${CONFIG_FILENAME} already exists — left untouched.\n`);
  } else {
    await writeFile(configPath, CONFIG_TEMPLATE, "utf8");
    process.stdout.write(`✔ Wrote ${CONFIG_FILENAME}\n`);
  }

  await ensureGitignore(root);
  process.stdout.write("\nNext: run `changeguard analyze --base main --no-ai`.\n");
  return 0;
}

/** Add `.changeguard/` to .gitignore without duplicating an existing entry. */
async function ensureGitignore(root: string): Promise<void> {
  const path = join(root, ".gitignore");
  const entry = ".changeguard/";
  let content = "";
  if (await exists(path)) {
    content = await readFile(path, "utf8");
    if (content.split(/\r?\n/).some((line) => line.trim() === entry || line.trim() === ".changeguard")) {
      process.stdout.write("✔ .gitignore already ignores .changeguard/\n");
      return;
    }
  }
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await writeFile(path, `${content}${prefix}\n# ChangeGuard AI generated output\n${entry}\n`, "utf8");
  process.stdout.write("✔ Added .changeguard/ to .gitignore\n");
}
