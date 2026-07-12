import { execa, ExecaError } from "execa";
import {
  BaseBranchMissingError,
  GitNotInstalledError,
  NotAGitRepositoryError
} from "../shared/errors.js";

export interface GitRunOptions {
  cwd: string;
  /** Max buffer for large diffs (default 100 MB). */
  maxBuffer?: number;
}

/**
 * Thin wrapper around the native `git` binary via execa.
 *
 * We deliberately shell out to git rather than reimplementing it: git's rename
 * detection, merge-base logic, and diff formatting are battle-tested and match
 * exactly what a developer sees locally.
 */
export class Git {
  readonly cwd: string;
  private readonly maxBuffer: number;

  constructor(options: GitRunOptions) {
    this.cwd = options.cwd;
    this.maxBuffer = options.maxBuffer ?? 100 * 1024 * 1024;
  }

  async run(args: string[]): Promise<string> {
    try {
      const result = await execa("git", args, {
        cwd: this.cwd,
        maxBuffer: this.maxBuffer,
        stripFinalNewline: false
      });
      return result.stdout;
    } catch (err) {
      throw this.mapError(err, args);
    }
  }

  private mapError(err: unknown, args: string[]): Error {
    if (err instanceof ExecaError) {
      // ENOENT => git binary not found.
      if ((err as { code?: string }).code === "ENOENT") {
        return new GitNotInstalledError(err);
      }
      const stderr = typeof err.stderr === "string" ? err.stderr : "";
      if (/not a git repository/i.test(stderr)) {
        return new NotAGitRepositoryError(this.cwd, err);
      }
      if (
        /unknown revision or path|bad revision|ambiguous argument|no merge base/i.test(stderr)
      ) {
        const ref = args.find((a) => !a.startsWith("-")) ?? "unknown";
        return new BaseBranchMissingError(ref, err);
      }
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  /** Absolute path to the repository root (respects worktrees). */
  async repoRoot(): Promise<string> {
    return (await this.run(["rev-parse", "--show-toplevel"])).trim();
  }

  async currentBranch(): Promise<string | undefined> {
    const out = (await this.run(["branch", "--show-current"])).trim();
    return out.length > 0 ? out : undefined;
  }

  /** True if `ref` resolves to a commit in this repository. */
  async refExists(ref: string): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }

  /** Best common ancestor of two refs; undefined when none exists. */
  async mergeBase(a: string, b: string): Promise<string | undefined> {
    try {
      const out = (await this.run(["merge-base", a, b])).trim();
      return out.length > 0 ? out : undefined;
    } catch {
      return undefined;
    }
  }

  async isShallow(): Promise<boolean> {
    try {
      const out = (await this.run(["rev-parse", "--is-shallow-repository"])).trim();
      return out === "true";
    } catch {
      return false;
    }
  }
}
