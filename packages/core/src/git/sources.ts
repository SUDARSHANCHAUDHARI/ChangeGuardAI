import type { Git } from "./git.js";
import {
  parseNameStatus,
  parseNumStat,
  splitUnifiedDiff,
  type RawChangedFile
} from "./diff-parser.js";
import { BaseBranchMissingError } from "../shared/errors.js";
import type { ChangeStatus } from "../types/domain.js";

/** How the diff to analyze is specified. */
export type DiffSource =
  | { kind: "range"; base: string; head: string }
  | { kind: "commits"; range: string }
  | { kind: "working" }
  | { kind: "staged" }
  | { kind: "patch"; content: string }
  // Files already collected out-of-band (e.g. from the GitHub PR API). No git
  // invocation is performed; the files are used as-is.
  | { kind: "prefetched"; files: RawChangedFile[]; description: string };

export interface CollectedDiff {
  files: RawChangedFile[];
  /** Full unified diff text (empty for patch sources without re-serialization). */
  rawDiff: string;
  /** Human-readable description of what was compared, for messages. */
  description: string;
}

const UNIFIED = "--unified=80";

/**
 * Resolve a DiffSource into a normalized list of changed files.
 *
 * Git-backed sources issue three commands (name-status, numstat, unified patch)
 * and merge them by post-image path. Patch sources are parsed directly with no
 * git invocation, so they work on shallow clones or outside a repo.
 */
export async function collectDiff(git: Git, source: DiffSource): Promise<CollectedDiff> {
  if (source.kind === "patch") {
    return collectFromPatch(source.content);
  }
  if (source.kind === "prefetched") {
    return { files: source.files, rawDiff: "", description: source.description };
  }

  const spec = await resolveSpec(git, source);
  const [nameStatusZ, numStatZ, patchText] = await Promise.all([
    git.run(["diff", ...spec.args, "--name-status", "-z", "-M"]),
    git.run(["diff", ...spec.args, "--numstat", "-z", "-M"]),
    git.run(["diff", ...spec.args, UNIFIED, "-M"])
  ]);

  const nameStatus = parseNameStatus(nameStatusZ);
  const numStat = parseNumStat(numStatZ);
  const patches = splitUnifiedDiff(patchText);

  const files: RawChangedFile[] = nameStatus.map((entry) => {
    const stat = numStat.get(entry.path);
    const patch = patches.get(entry.path) ?? "";
    const file: RawChangedFile = {
      path: entry.path,
      status: entry.status,
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      patch,
      binary: stat?.binary ?? /Binary files .* differ/.test(patch)
    };
    if (entry.previousPath !== undefined) file.previousPath = entry.previousPath;
    return file;
  });

  return { files, rawDiff: patchText, description: spec.description };
}

interface ResolvedSpec {
  args: string[];
  description: string;
}

async function resolveSpec(git: Git, source: DiffSource): Promise<ResolvedSpec> {
  switch (source.kind) {
    case "range": {
      const baseOk = await git.refExists(source.base);
      if (!baseOk) throw new BaseBranchMissingError(source.base);
      const headOk = await git.refExists(source.head);
      if (!headOk) throw new BaseBranchMissingError(source.head);
      // Triple-dot: diff from the merge-base of base and head to head. Mirrors
      // `git diff main...HEAD`, i.e. "what this branch changed".
      return {
        args: [`${source.base}...${source.head}`],
        description: `${source.base}...${source.head}`
      };
    }
    case "commits":
      return { args: [source.range], description: source.range };
    case "working":
      // Compare the working tree (staged + unstaged) against HEAD. Untracked
      // files are not included — documented in docs/configuration.md.
      return { args: ["HEAD"], description: "working tree vs HEAD" };
    case "staged":
      return { args: ["--cached"], description: "staged changes" };
    case "patch":
    case "prefetched":
      // Handled before resolveSpec is called.
      return { args: [], description: source.kind };
  }
}

/** Parse a standalone patch file (git or unified format) into changed files. */
export function collectFromPatch(content: string): CollectedDiff {
  const patches = splitUnifiedDiff(content);
  const files: RawChangedFile[] = [];
  for (const [path, chunk] of patches) {
    files.push(fileFromPatchChunk(path, chunk));
  }
  return { files, rawDiff: content, description: "patch file" };
}

function fileFromPatchChunk(path: string, chunk: string): RawChangedFile {
  const lines = chunk.split("\n");
  let status: ChangeStatus = "modified";
  let previousPath: string | undefined;
  let additions = 0;
  let deletions = 0;
  let binary = false;

  for (const line of lines) {
    if (line.startsWith("new file mode")) status = "added";
    else if (line.startsWith("deleted file mode")) status = "deleted";
    else if (line.startsWith("rename from ")) {
      status = "renamed";
      previousPath = line.slice("rename from ".length).trim();
    } else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) {
      binary = true;
    } else if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }

  const file: RawChangedFile = { path, status, additions, deletions, patch: chunk, binary };
  if (previousPath !== undefined) file.previousPath = previousPath;
  return file;
}
