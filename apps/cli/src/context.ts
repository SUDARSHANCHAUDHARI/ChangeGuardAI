import {
  Git,
  loadConfig,
  createLogger,
  levelFromFlags,
  type ChangeGuardConfig,
  type Logger
} from "@changeguard/core";

export interface GlobalFlags {
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  config?: string;
  cwd?: string;
}

export interface CommandContext {
  cwd: string;
  git: Git;
  config: ChangeGuardConfig;
  configSource?: string;
  logger: Logger;
  flags: GlobalFlags;
}

/**
 * Build the shared context every command needs: resolved cwd, loaded config,
 * a Git handle, and a logger tuned to the verbosity flags.
 */
export async function createContext(flags: GlobalFlags): Promise<CommandContext> {
  const cwd = flags.cwd ?? process.cwd();
  const logger = createLogger({ level: levelFromFlags(flags), json: flags.json ?? false });
  const { config, source } = await loadConfig(cwd, flags.config);
  const git = new Git({ cwd });
  const ctx: CommandContext = { cwd, git, config, logger, flags };
  if (source !== undefined) ctx.configSource = source;
  return ctx;
}
