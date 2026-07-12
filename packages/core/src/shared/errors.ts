import { ExitCode, type ExitCodeValue } from "./exit-codes.js";

/**
 * Base class for all ChangeGuard errors. Every error carries a stable `code`
 * for programmatic handling and an `exitCode` the CLI maps to `process.exit`.
 */
export class ChangeGuardError extends Error {
  readonly code: string;
  readonly exitCode: ExitCodeValue;
  /** Optional operator-facing hint on how to fix the problem. */
  readonly hint?: string;

  constructor(
    code: string,
    message: string,
    options: { exitCode?: ExitCodeValue; hint?: string; cause?: unknown } = {}
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.exitCode = options.exitCode ?? ExitCode.InternalError;
    if (options.hint !== undefined) this.hint = options.hint;
  }
}

export class NotAGitRepositoryError extends ChangeGuardError {
  constructor(cwd: string, cause?: unknown) {
    super("git.not_a_repository", `Not inside a Git repository: ${cwd}`, {
      exitCode: ExitCode.InternalError,
      hint: "Run ChangeGuard from within a Git working tree, or `git init` first.",
      cause
    });
  }
}

export class GitNotInstalledError extends ChangeGuardError {
  constructor(cause?: unknown) {
    super("git.not_installed", "Git does not appear to be installed or on PATH.", {
      exitCode: ExitCode.InternalError,
      hint: "Install Git and ensure the `git` binary is available on your PATH.",
      cause
    });
  }
}

export class BaseBranchMissingError extends ChangeGuardError {
  constructor(ref: string, cause?: unknown) {
    super("git.base_missing", `Base ref \`${ref}\` could not be resolved.`, {
      exitCode: ExitCode.InternalError,
      hint: "Fetch the base branch (e.g. `git fetch origin main`) or pass an existing --base.",
      cause
    });
  }
}

export class EmptyDiffError extends ChangeGuardError {
  constructor(description: string) {
    super("git.empty_diff", `No changes detected for ${description}.`, {
      exitCode: ExitCode.Success,
      hint: "There is nothing to analyze between the selected refs."
    });
  }
}

export class InvalidConfigurationError extends ChangeGuardError {
  constructor(message: string, cause?: unknown) {
    super("config.invalid", `Invalid configuration: ${message}`, {
      exitCode: ExitCode.InvalidConfiguration,
      cause
    });
  }
}

export class GitHubTokenMissingError extends ChangeGuardError {
  constructor() {
    super("github.token_missing", "GITHUB_TOKEN is required for --pr analysis but was not set.", {
      exitCode: ExitCode.InternalError,
      hint: "Export GITHUB_TOKEN with a token that can read the repository."
    });
  }
}

export class PullRequestNotFoundError extends ChangeGuardError {
  constructor(number: number, cause?: unknown) {
    super("github.pr_not_found", `Pull request #${number} was not found or is inaccessible.`, {
      exitCode: ExitCode.InternalError,
      cause
    });
  }
}

export class ProviderUnavailableError extends ChangeGuardError {
  constructor(provider: string, cause?: unknown) {
    super("ai.provider_unavailable", `AI provider "${provider}" is unavailable.`, {
      exitCode: ExitCode.InternalError,
      hint: "Deterministic analysis still ran. Re-run with --no-ai to skip AI entirely.",
      cause
    });
  }
}

export class InvalidAIResponseError extends ChangeGuardError {
  constructor(detail: string, cause?: unknown) {
    super("ai.invalid_response", `AI provider returned an invalid response: ${detail}`, {
      exitCode: ExitCode.InternalError,
      cause
    });
  }
}

export class OutputWriteError extends ChangeGuardError {
  constructor(path: string, cause?: unknown) {
    super("output.write_failed", `Could not write output to ${path}.`, {
      exitCode: ExitCode.InternalError,
      cause
    });
  }
}

export function isChangeGuardError(err: unknown): err is ChangeGuardError {
  return err instanceof ChangeGuardError;
}
