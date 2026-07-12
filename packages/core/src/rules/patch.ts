/**
 * Utilities for reading unified-diff patches at the line level. Rules use these
 * instead of parsing patches themselves, so evidence and line numbers are
 * consistent across the rule set.
 *
 * These are line-based heuristics, NOT an AST. A rule built on them can only
 * claim what a textual diff supports — every rule documents that limitation.
 */

export type DiffLineType = "add" | "del" | "context";

export interface DiffLine {
  type: DiffLineType;
  /** Line content without the leading +/-/space marker. */
  content: string;
  /** 1-based line number in the new file (add/context lines). */
  newLine?: number;
  /** 1-based line number in the old file (del/context lines). */
  oldLine?: number;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parse a file patch into ordered diff lines with resolved line numbers. */
export function parseHunks(patch: string): DiffLine[] {
  const lines = patch.split("\n");
  const out: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of lines) {
    const hunk = HUNK_RE.exec(raw);
    if (hunk !== null) {
      oldLine = Number.parseInt(hunk[1] ?? "0", 10);
      newLine = Number.parseInt(hunk[2] ?? "0", 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    // Diff metadata lines that can appear inside file sections.
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"

    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === "+") {
      out.push({ type: "add", content, newLine });
      newLine += 1;
    } else if (marker === "-") {
      out.push({ type: "del", content, oldLine });
      oldLine += 1;
    } else if (marker === " ") {
      out.push({ type: "context", content, newLine, oldLine });
      newLine += 1;
      oldLine += 1;
    }
  }
  return out;
}

export function addedLines(patch: string): DiffLine[] {
  return parseHunks(patch).filter((l) => l.type === "add");
}

export function removedLines(patch: string): DiffLine[] {
  return parseHunks(patch).filter((l) => l.type === "del");
}

/** Concatenated added-line text (for cheap substring checks). */
export function addedText(patch: string): string {
  return addedLines(patch)
    .map((l) => l.content)
    .join("\n");
}

/** Concatenated removed-line text. */
export function removedText(patch: string): string {
  return removedLines(patch)
    .map((l) => l.content)
    .join("\n");
}
