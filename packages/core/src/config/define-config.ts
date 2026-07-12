import type { ChangeGuardConfigInput } from "./schema.js";

/**
 * Identity helper that gives users full type-checking and autocomplete in
 * `changeguard.config.ts`. It does not validate at authoring time — validation
 * happens when the config is loaded (see `load.ts`).
 */
export function defineConfig(config: ChangeGuardConfigInput): ChangeGuardConfigInput {
  return config;
}
