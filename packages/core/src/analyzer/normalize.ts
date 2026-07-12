import type { ChangedFile } from "../types/domain.js";
import type { RawChangedFile } from "../git/diff-parser.js";
import { classifyFile, detectLanguage, type ClassificationOverride } from "./classify.js";
import { matchAny } from "../shared/glob.js";

export interface NormalizeOptions {
  include: string[];
  exclude: string[];
  classify: ClassificationOverride[];
}

/**
 * Turn raw diff entries into fully-typed ChangedFile records: classify each
 * file, detect its language, and apply include/exclude filters.
 *
 * Filtering semantics:
 *   - exclude always wins (an excluded path is dropped even if included).
 *   - a non-empty include list restricts to matching paths; an empty include
 *     list means "everything not excluded".
 */
export function normalizeFiles(raw: RawChangedFile[], options: NormalizeOptions): ChangedFile[] {
  const out: ChangedFile[] = [];
  for (const file of raw) {
    if (matchAny(options.exclude, file.path)) continue;
    if (options.include.length > 0 && !matchAny(options.include, file.path)) continue;

    const language = detectLanguage(file.path);
    const normalized: ChangedFile = {
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
      binary: file.binary,
      category: classifyFile(file.path, options.classify)
    };
    if (file.previousPath !== undefined) normalized.previousPath = file.previousPath;
    if (language !== undefined) normalized.language = language;
    out.push(normalized);
  }
  return out;
}
