import type { ChangedFile, Finding } from "../types/domain.js";
import { makeFinding } from "../rules/types.js";
import type { AIRawFinding } from "./types.js";

export interface ValidateOptions {
  changedFiles: ChangedFile[];
  deterministicFindings: Finding[];
  minimumConfidence: number;
}

export interface ValidationResult {
  findings: Finding[];
  rejected: Array<{ title: string; reason: string }>;
}

const STYLE_ONLY = /\b(style|styling|format|formatting|indent(ation)?|whitespace|semicolons?|lint(er|ing)?|prettier|eslint rule|naming convention|typo)\b/i;

/**
 * Convert raw AI findings into trusted Findings, rejecting anything that fails
 * the evidence rules (see docs/security.md). The model's output is untrusted:
 * a finding is only accepted if it references a changed file, its evidence
 * actually appears in that file's diff, it clears the confidence threshold, it
 * is not style-only, and it does not duplicate a deterministic finding.
 */
export function validateAIFindings(raw: AIRawFinding[], options: ValidateOptions): ValidationResult {
  const findings: Finding[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];

  const byPath = new Map<string, ChangedFile>();
  for (const f of options.changedFiles) byPath.set(f.path, f);

  const deterministicKeys = new Set(
    options.deterministicFindings.map((f) => `${f.file}::${normalize(f.title)}`)
  );

  for (const item of raw) {
    const reject = (reason: string): void => {
      rejected.push({ title: item.title, reason });
    };

    const file = byPath.get(item.file);
    if (file === undefined) {
      reject("references a file that is not in the change set");
      continue;
    }
    if (item.evidence.trim().length === 0) {
      reject("no evidence");
      continue;
    }
    if (item.confidence < options.minimumConfidence) {
      reject(`confidence ${item.confidence} below threshold ${options.minimumConfidence}`);
      continue;
    }
    if (STYLE_ONLY.test(item.title) && STYLE_ONLY.test(`${item.title} ${item.description}`)) {
      reject("style/formatting only");
      continue;
    }
    if (!evidenceSupported(item.evidence, file)) {
      reject("evidence not found in the file's diff");
      continue;
    }
    if (deterministicKeys.has(`${item.file}::${normalize(item.title)}`)) {
      reject("duplicates a deterministic finding");
      continue;
    }

    findings.push(
      makeFinding({
        // AI findings have no ruleId.
        title: item.title,
        description: item.description,
        severity: item.severity,
        category: item.category,
        file: item.file,
        ...(item.startLine !== undefined ? { startLine: item.startLine } : {}),
        ...(item.endLine !== undefined ? { endLine: item.endLine } : {}),
        evidence: item.evidence.trim(),
        recommendation: item.recommendation,
        confidence: item.confidence,
        source: "ai"
      })
    );
  }

  return { findings, rejected };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The AI's evidence must actually appear in the file's diff. We compare a
 * whitespace-normalized snippet against the whitespace-normalized patch so
 * fabricated evidence is rejected. A short snippet (>= 6 non-space chars) must
 * be a substring of the patch.
 */
function evidenceSupported(evidence: string, file: ChangedFile): boolean {
  const haystack = collapse(file.patch);
  const needle = collapse(evidence);
  if (needle.length < 6) return false;
  if (haystack.includes(needle)) return true;
  // Allow multi-line evidence: require the longest line to be present.
  const longest = evidence
    .split("\n")
    .map((l) => collapse(l))
    .filter((l) => l.length >= 6)
    .sort((a, b) => b.length - a.length)[0];
  return longest !== undefined && haystack.includes(longest);
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
