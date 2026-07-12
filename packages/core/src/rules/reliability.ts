import type { ChangeGuardRule } from "./types.js";
import { removedGuardRule } from "./factories.js";
import { makeFinding } from "./types.js";
import { addedLines } from "./patch.js";

const LIMIT =
  "Textual heuristic on changed lines. It detects the presence/absence of patterns but cannot follow control flow, so it favors false negatives.";

export const reliabilityRules: ChangeGuardRule[] = [
  removedGuardRule({
    id: "reliability.error-handling-removed",
    name: "Error handling removed",
    description: "A try/catch or error-handling branch appears to have been removed.",
    category: "reliability",
    severity: "medium",
    pattern: /\b(try\s*\{|catch\s*\(|\.catch\(|except\b|rescue\b)/,
    recommendation: "Confirm errors on this path are still handled and surfaced.",
    confidence: 0.4,
    limitations: LIMIT
  }),
  removedGuardRule({
    id: "reliability.timeout-removed",
    name: "Timeout removed",
    description: "A timeout configuration appears to have been removed.",
    category: "reliability",
    severity: "medium",
    pattern: /\b(timeout|setTimeout|AbortController|deadline|withTimeout)\b/i,
    recommendation: "Ensure external calls remain bounded by a timeout.",
    confidence: 0.4,
    limitations: LIMIT
  }),
  removedGuardRule({
    id: "reliability.retry-removed",
    name: "Retry removed",
    description: "Retry/backoff logic appears to have been removed.",
    category: "reliability",
    severity: "low",
    pattern: /\b(retry|retries|backoff|p-retry|exponential)\b/i,
    recommendation: "Confirm transient failures are still handled where needed.",
    confidence: 0.4,
    limitations: LIMIT
  }),
  removedGuardRule({
    id: "reliability.fallback-removed",
    name: "Fallback removed",
    description: "A fallback/default branch appears to have been removed.",
    category: "reliability",
    severity: "low",
    pattern: /\b(fallback|default:|catchAll|\?\?|onError)\b/i,
    recommendation: "Ensure a safe default still exists for failure/edge cases.",
    confidence: 0.35,
    limitations: LIMIT
  }),
  {
    id: "reliability.empty-catch-added",
    name: "Empty catch block added",
    description: "A catch block that swallows the error was introduced.",
    category: "reliability",
    defaultSeverity: "medium",
    limitations:
      "Detects catch blocks with no visible body on the changed lines. Multi-line empty catches split across hunks may be missed.",
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.binary) continue;
        for (const l of addedLines(file.patch)) {
          if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(l.content) || /except[^:]*:\s*pass\b/.test(l.content)) {
            findings.push(
              makeFinding({
                ruleId: "reliability.empty-catch-added",
                title: "Empty catch block added",
                description: "An error is being silently swallowed, hiding failures.",
                severity: "medium",
                category: "reliability",
                file: file.path,
                ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                evidence: l.content.trim().slice(0, 200),
                recommendation: "Log or handle the error, or let it propagate.",
                confidence: 0.6
              })
            );
          }
        }
      }
      return findings;
    }
  },
  {
    id: "reliability.promise-not-awaited",
    name: "Possibly un-awaited promise",
    description: "An async call may have been introduced without await or error handling.",
    category: "reliability",
    defaultSeverity: "low",
    limitations:
      "Flags added lines that call an async-looking function without await/return/.then/.catch on the same line. It cannot resolve whether the function actually returns a promise.",
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.binary || (file.language !== "typescript" && file.language !== "javascript")) continue;
        for (const l of addedLines(file.patch)) {
          const c = l.content;
          if (/^\s*\w+(\.\w+)*\((.*)\)\s*;?\s*$/.test(c) && /(await|async|fetch|axios|prisma|query|save|update|delete|create)\(/i.test(c) && !/\b(await|return)\b|\.then\(|\.catch\(|=\s*/.test(c)) {
            findings.push(
              makeFinding({
                ruleId: "reliability.promise-not-awaited",
                title: "Possibly un-awaited promise",
                description: "An async call may run without being awaited, so its errors can go unhandled.",
                severity: "low",
                category: "reliability",
                file: file.path,
                ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                evidence: c.trim().slice(0, 200),
                recommendation: "Await the call or explicitly handle the returned promise.",
                confidence: 0.3
              })
            );
          }
        }
      }
      return findings;
    }
  }
];
