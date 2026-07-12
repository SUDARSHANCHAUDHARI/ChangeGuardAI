import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { Git } from "../git/git.js";
import type { RepositoryInfo } from "../types/domain.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const text = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function depNames(pkg: Record<string, unknown> | undefined): Set<string> {
  const names = new Set<string>();
  if (pkg === undefined) return names;
  for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
    const group = pkg[key];
    if (typeof group === "object" && group !== null) {
      for (const name of Object.keys(group as Record<string, unknown>)) names.add(name);
    }
  }
  return names;
}

/**
 * Inspect a repository by reading real files (never guessing from the folder
 * name). Detection is best-effort and additive: absence of a signal simply
 * means the corresponding array stays empty.
 */
export async function inspectRepository(
  git: Git,
  options: { baseBranch: string; githubToken?: string }
): Promise<RepositoryInfo> {
  const root = await git.repoRoot();
  const currentBranch = await git.currentBranch();

  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const testFrameworks = new Set<string>();
  const databaseTools = new Set<string>();
  const apiFrameworks = new Set<string>();

  const pkg = await readJsonSafe(join(root, "package.json"));
  const deps = depNames(pkg);

  // Package manager.
  let packageManager: RepositoryInfo["packageManager"] = "unknown";
  if (await exists(join(root, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (await exists(join(root, "yarn.lock"))) packageManager = "yarn";
  else if (await exists(join(root, "bun.lockb"))) packageManager = "bun";
  else if (await exists(join(root, "package-lock.json"))) packageManager = "npm";

  // Languages from manifests / config files.
  if (pkg !== undefined) languages.add("javascript");
  if ((await exists(join(root, "tsconfig.json"))) || deps.has("typescript")) languages.add("typescript");
  if ((await exists(join(root, "pyproject.toml"))) || (await exists(join(root, "requirements.txt"))))
    languages.add("python");
  if (await exists(join(root, "go.mod"))) languages.add("go");
  if (await exists(join(root, "Cargo.toml"))) languages.add("rust");
  if ((await exists(join(root, "pom.xml"))) || (await exists(join(root, "build.gradle")))) languages.add("java");

  // Monorepo.
  const monorepo =
    (await exists(join(root, "pnpm-workspace.yaml"))) ||
    (await exists(join(root, "turbo.json"))) ||
    (await exists(join(root, "nx.json"))) ||
    (Array.isArray(pkg?.["workspaces"]) && (pkg["workspaces"] as unknown[]).length > 0);

  // Frameworks / test frameworks / API / DB — from dependency names.
  const has = (name: string): boolean => deps.has(name);
  if (has("next")) frameworks.add("next.js");
  if (has("react")) frameworks.add("react");
  if (has("vue")) frameworks.add("vue");
  if (has("@angular/core")) frameworks.add("angular");
  if (has("svelte")) frameworks.add("svelte");

  if (has("vitest")) testFrameworks.add("vitest");
  if (has("jest")) testFrameworks.add("jest");
  if (has("mocha")) testFrameworks.add("mocha");
  if (has("@playwright/test") || has("playwright")) testFrameworks.add("playwright");
  if (has("cypress")) testFrameworks.add("cypress");

  if (has("express")) apiFrameworks.add("express");
  if (has("fastify")) apiFrameworks.add("fastify");
  if (has("@nestjs/core")) apiFrameworks.add("nestjs");
  if (has("koa")) apiFrameworks.add("koa");
  if (has("@hapi/hapi")) apiFrameworks.add("hapi");
  if (has("graphql")) apiFrameworks.add("graphql");

  if (has("prisma") || has("@prisma/client") || (await exists(join(root, "prisma/schema.prisma"))))
    databaseTools.add("prisma");
  if (has("typeorm")) databaseTools.add("typeorm");
  if (has("sequelize")) databaseTools.add("sequelize");
  if (has("drizzle-orm")) databaseTools.add("drizzle");
  if (has("mongoose")) databaseTools.add("mongoose");
  if (has("knex")) databaseTools.add("knex");

  const ciConfigured =
    (await exists(join(root, ".github/workflows"))) ||
    (await exists(join(root, ".gitlab-ci.yml"))) ||
    (await exists(join(root, ".circleci")));

  const github = await detectGithubRepo(git, root);

  const info: RepositoryInfo = {
    root,
    baseBranch: options.baseBranch,
    packageManager,
    languages: [...languages],
    frameworks: [...frameworks],
    testFrameworks: [...testFrameworks],
    monorepo,
    databaseTools: [...databaseTools],
    apiFrameworks: [...apiFrameworks],
    ciConfigured
  };
  if (currentBranch !== undefined) info.currentBranch = currentBranch;
  if (github !== undefined) info.github = github;
  return info;
}

/** Parse `owner/name` from the origin remote URL, if it points at GitHub. */
async function detectGithubRepo(
  git: Git,
  _root: string
): Promise<{ owner: string; name: string } | undefined> {
  let url: string;
  try {
    url = (await git.run(["remote", "get-url", "origin"])).trim();
  } catch {
    return undefined;
  }
  // Match both SSH (git@github.com:owner/name.git) and HTTPS forms. Any
  // embedded credentials in the URL are ignored and never returned/logged.
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    return { owner: m[1], name: m[2] };
  }
  return undefined;
}
