import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { configSchema, type ChangeGuardConfig } from "./schema.js";
import { InvalidConfigurationError } from "../shared/errors.js";

/**
 * Config resolution precedence (first found wins):
 *   1. explicit --config path
 *   2. changeguard.config.ts
 *   3. changeguard.config.js
 *   4. changeguard.config.mjs
 *   5. .changeguardrc.json
 *   6. "changeguard" field in package.json
 *   7. built-in defaults
 */
const CANDIDATES = [
  "changeguard.config.ts",
  "changeguard.config.js",
  "changeguard.config.mjs",
  ".changeguardrc.json"
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface LoadConfigResult {
  config: ChangeGuardConfig;
  /** Absolute path the config came from, or undefined for built-in defaults. */
  source?: string;
}

export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadConfigResult> {
  const found = explicitPath !== undefined ? resolve(cwd, explicitPath) : await findConfig(cwd);
  if (found === undefined) {
    return { config: configSchema.parse({}) };
  }

  const raw = await readRawConfig(found);
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidConfigurationError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return { config: parsed.data, source: found };
}

async function findConfig(cwd: string): Promise<string | undefined> {
  for (const name of CANDIDATES) {
    const path = join(cwd, name);
    if (await exists(path)) return path;
  }
  // package.json "changeguard" field.
  const pkgPath = join(cwd, "package.json");
  if (await exists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
      if (pkg["changeguard"] !== undefined) return pkgPath;
    } catch {
      // Ignore malformed package.json here; git/other steps will surface it.
    }
  }
  return undefined;
}

async function readRawConfig(path: string): Promise<unknown> {
  try {
    if (path.endsWith(".json")) {
      return JSON.parse(await readFile(path, "utf8"));
    }
    if (path.endsWith("package.json")) {
      const pkg = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      return pkg["changeguard"];
    }
    // .ts / .js / .mjs — load through jiti so TypeScript configs work without a
    // separate build step. jiti transpiles on the fly and caches.
    const jiti = createJiti(pathToFileURL(path).href);
    const mod = (await jiti.import(path)) as { default?: unknown } & Record<string, unknown>;
    return mod.default ?? mod;
  } catch (err) {
    throw new InvalidConfigurationError(`could not load config at ${path}`, err);
  }
}
