import type { ChangeStatus } from "../types/domain.js";

/**
 * A changed file before classification. `classify.ts` adds `category` and
 * `language` to produce a full `ChangedFile`.
 */
export interface RawChangedFile {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  patch: string;
  binary: boolean;
}

/** Map a git status letter to our ChangeStatus. */
function mapStatusLetter(letter: string): ChangeStatus {
  switch (letter[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C": // copied — treat like added for risk purposes
      return "added";
    default:
      return "modified";
  }
}

/**
 * Parse `git diff --name-status -z -M` output.
 *
 * NUL-delimited to survive paths containing spaces or tabs. Rename/copy
 * entries are three tokens (status, old, new); all others are two.
 */
export function parseNameStatus(
  z: string
): Array<{ status: ChangeStatus; path: string; previousPath?: string }> {
  const tokens = z.split("\0").filter((t) => t.length > 0);
  const out: Array<{ status: ChangeStatus; path: string; previousPath?: string }> = [];
  let i = 0;
  while (i < tokens.length) {
    const rawStatus = tokens[i];
    if (rawStatus === undefined) break;
    const status = mapStatusLetter(rawStatus);
    if ((rawStatus[0] === "R" || rawStatus[0] === "C") && i + 2 < tokens.length) {
      const previousPath = tokens[i + 1];
      const path = tokens[i + 2];
      if (previousPath !== undefined && path !== undefined) {
        out.push({ status, path, previousPath });
      }
      i += 3;
    } else {
      const path = tokens[i + 1];
      if (path !== undefined) out.push({ status, path });
      i += 2;
    }
  }
  return out;
}

export interface NumStatEntry {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

/**
 * Parse `git diff --numstat -z -M` output.
 *
 * Record formats with -z:
 *   normal:  "add\tdel\tpath\0"          (one NUL token)
 *   rename:  "add\tdel\t\0from\0to\0"     (three NUL tokens; inline path empty)
 *
 * Binary files are reported as `-\t-` and yield `binary: true` with zero line
 * counts. Entries are keyed by post-image (new) path.
 *
 * Limitation: paths containing a literal tab are not supported (extremely rare;
 * git itself only emits them unquoted under -z).
 */
export function parseNumStat(z: string): Map<string, NumStatEntry> {
  const map = new Map<string, NumStatEntry>();
  const tokens = z.split("\0");
  let i = 0;
  while (i < tokens.length) {
    const head = tokens[i];
    if (head === undefined || head.length === 0 || !head.includes("\t")) {
      i += 1;
      continue;
    }
    const parts = head.split("\t");
    const addStr = parts[0] ?? "";
    const delStr = parts[1] ?? "";
    const inlinePath = parts[2] ?? "";
    const binary = addStr === "-" || delStr === "-";
    const additions = binary ? 0 : Number.parseInt(addStr, 10) || 0;
    const deletions = binary ? 0 : Number.parseInt(delStr, 10) || 0;

    if (inlinePath.length > 0) {
      map.set(inlinePath, { path: inlinePath, additions, deletions, binary });
      i += 1;
    } else {
      // Rename record: the two following NUL tokens are `from` then `to`.
      const to = tokens[i + 2];
      if (to !== undefined && to.length > 0) {
        map.set(to, { path: to, additions, deletions, binary });
      }
      i += 3;
    }
  }
  return map;
}

/**
 * Split a full unified diff into per-file patch chunks, keyed by the file's
 * post-image path (or pre-image path for deletions).
 */
export function splitUnifiedDiff(diff: string): Map<string, string> {
  const chunks = new Map<string, string>();
  if (diff.trim().length === 0) return chunks;
  const lines = diff.split("\n");
  let current: string[] = [];
  const flush = (): void => {
    if (current.length === 0) return;
    const text = current.join("\n");
    const path = pathFromChunk(current);
    if (path !== undefined) chunks.set(path, text);
    current = [];
  };
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
    }
    current.push(line);
  }
  flush();
  return chunks;
}

function stripPrefix(p: string): string {
  if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
  return p;
}

function pathFromChunk(chunkLines: string[]): string | undefined {
  let renameTo: string | undefined;
  let plusPath: string | undefined;
  let minusPath: string | undefined;
  for (const line of chunkLines) {
    if (line.startsWith("rename to ")) {
      renameTo = line.slice("rename to ".length).trim();
    } else if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      if (p !== "/dev/null") plusPath = stripPrefix(p);
    } else if (line.startsWith("--- ")) {
      const p = line.slice(4).trim();
      if (p !== "/dev/null") minusPath = stripPrefix(p);
    }
  }
  if (renameTo !== undefined) return renameTo;
  if (plusPath !== undefined) return plusPath;
  if (minusPath !== undefined) return minusPath;
  // Fall back to the `diff --git a/x b/y` header (best-effort for odd paths).
  const header = chunkLines[0];
  if (header !== undefined && header.startsWith("diff --git ")) {
    const m = header.match(/ b\/(.+)$/);
    if (m && m[1] !== undefined) return m[1].trim();
  }
  return undefined;
}
