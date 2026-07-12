import type { Finding } from "../types/domain.js";

/**
 * Deduplicate findings using a composite fingerprint:
 *   ruleId · file · line-bucket · normalized title · evidence fingerprint
 *
 * When two findings collide, the deterministic (rule/scanner) finding wins over
 * an AI finding, and useful extra context from the loser is merged in. This is
 * how AI output is prevented from duplicating deterministic results (see
 * docs/security.md).
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();

  for (const finding of findings) {
    const key = fingerprint(finding);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, finding);
      continue;
    }
    byKey.set(key, merge(existing, finding));
  }

  return [...byKey.values()];
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function evidenceFingerprint(evidence: string): string {
  // Collapse whitespace and truncate so trivially different formatting of the
  // same evidence collides.
  return evidence.replace(/\s+/g, " ").trim().slice(0, 120).toLowerCase();
}

function fingerprint(f: Finding): string {
  const lineBucket = f.startLine !== undefined ? Math.floor(f.startLine / 3) : "na";
  return [
    f.ruleId ?? "no-rule",
    f.file,
    lineBucket,
    normalizeTitle(f.title),
    evidenceFingerprint(f.evidence)
  ].join("|");
}

/** Prefer the deterministic finding; enrich it with the other's description. */
function merge(a: Finding, b: Finding): Finding {
  const deterministic = a.source !== "ai" ? a : b.source !== "ai" ? b : a;
  const other = deterministic === a ? b : a;

  const merged: Finding = { ...deterministic };
  // Fold in the higher confidence and any extra AI description as context.
  merged.confidence = Math.max(a.confidence, b.confidence);
  if (other.source === "ai" && other.description.trim().length > 0 && !merged.description.includes(other.description)) {
    merged.description = `${merged.description}\n\nAI context: ${other.description}`.trim();
  }
  return merged;
}
