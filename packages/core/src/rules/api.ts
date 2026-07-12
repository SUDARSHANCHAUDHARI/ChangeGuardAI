import type { ChangeGuardRule } from "./types.js";
import { makeFinding } from "./types.js";
import { addedLines, removedLines } from "./patch.js";

const LIMIT =
  "Textual heuristic on API-classified files. It reads route/handler patterns from the diff and cannot confirm a route is truly public or that a signature is part of the exported contract.";

const ROUTE_RE = /\b(app|router|route|api)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i;

export const apiRules: ChangeGuardRule[] = [
  {
    id: "api.route-removed",
    name: "API route removed",
    description: "A registered HTTP route was removed, which may break existing clients.",
    category: "compatibility",
    defaultSeverity: "high",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.category !== "api" || file.binary) continue;
        const removedRoutes = new Set<string>();
        const addedRoutes = new Set<string>();
        for (const l of removedLines(file.patch)) {
          const m = ROUTE_RE.exec(l.content);
          if (m) removedRoutes.add(`${m[2]?.toLowerCase()} ${m[3]}`);
        }
        for (const l of addedLines(file.patch)) {
          const m = ROUTE_RE.exec(l.content);
          if (m) addedRoutes.add(`${m[2]?.toLowerCase()} ${m[3]}`);
        }
        for (const route of removedRoutes) {
          if (!addedRoutes.has(route)) {
            findings.push(
              makeFinding({
                ruleId: "api.route-removed",
                title: "API route removed",
                description: `The route \`${route}\` was removed and may break existing clients.`,
                severity: "high",
                category: "compatibility",
                file: file.path,
                evidence: route,
                recommendation: "Confirm no clients depend on this route, or version/deprecate it before removal.",
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
    id: "api.http-method-changed",
    name: "API HTTP method changed",
    description: "A route's HTTP method changed, a breaking change for clients.",
    category: "compatibility",
    defaultSeverity: "high",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.category !== "api" || file.binary) continue;
        const removedPaths = new Map<string, string>();
        for (const l of removedLines(file.patch)) {
          const m = ROUTE_RE.exec(l.content);
          if (m && m[3] !== undefined && m[2] !== undefined) removedPaths.set(m[3], m[2].toLowerCase());
        }
        for (const l of addedLines(file.patch)) {
          const m = ROUTE_RE.exec(l.content);
          if (m && m[3] !== undefined && m[2] !== undefined) {
            const before = removedPaths.get(m[3]);
            if (before !== undefined && before !== m[2].toLowerCase()) {
              findings.push(
                makeFinding({
                  ruleId: "api.http-method-changed",
                  title: "API HTTP method changed",
                  description: `Route \`${m[3]}\` changed method from ${before.toUpperCase()} to ${m[2].toUpperCase()}.`,
                  severity: "high",
                  category: "compatibility",
                  file: file.path,
                  ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                  evidence: l.content.trim().slice(0, 200),
                  recommendation: "Keep the old method working or coordinate a client migration.",
                  confidence: 0.6
                })
              );
            }
          }
        }
      }
      return findings;
    }
  },
  {
    id: "api.required-field-added",
    name: "Required request field added",
    description: "A new required (non-optional) validation field was added to an API schema.",
    category: "compatibility",
    defaultSeverity: "medium",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.category !== "api" || file.binary) continue;
        for (const l of addedLines(file.patch)) {
          // A zod field that is not marked optional/nullable/default.
          if (/\bz\.(string|number|boolean|object|array|enum)\(/.test(l.content) && !/(optional|nullable|default)\(/.test(l.content)) {
            findings.push(
              makeFinding({
                ruleId: "api.required-field-added",
                title: "Required request field added",
                description: "A new required field was added to a request schema; older clients omitting it will now fail validation.",
                severity: "medium",
                category: "compatibility",
                file: file.path,
                ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                evidence: l.content.trim().slice(0, 200),
                recommendation: "Make the field optional, provide a default, or version the endpoint.",
                confidence: 0.4
              })
            );
          }
        }
      }
      return findings;
    }
  },
  {
    id: "api.public-function-signature-changed",
    name: "Exported function signature changed",
    description: "An exported function signature changed, which may break importers.",
    category: "compatibility",
    defaultSeverity: "medium",
    limitations:
      "Compares exported-function signature lines textually. It cannot resolve whether the symbol is part of the package's published API surface.",
    async evaluate(ctx) {
      const findings = [];
      const sig = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/;
      for (const file of ctx.files) {
        if (file.binary) continue;
        if (file.category !== "source" && file.category !== "api") continue;
        const removed = new Map<string, string>();
        for (const l of removedLines(file.patch)) {
          const m = sig.exec(l.content);
          if (m && m[1] !== undefined) removed.set(m[1], (m[2] ?? "").trim());
        }
        for (const l of addedLines(file.patch)) {
          const m = sig.exec(l.content);
          if (m && m[1] !== undefined) {
            const before = removed.get(m[1]);
            if (before !== undefined && before !== (m[2] ?? "").trim()) {
              findings.push(
                makeFinding({
                  ruleId: "api.public-function-signature-changed",
                  title: "Exported function signature changed",
                  description: `Exported \`${m[1]}\` changed parameters from (${before}) to (${(m[2] ?? "").trim()}).`,
                  severity: "medium",
                  category: "compatibility",
                  file: file.path,
                  ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                  evidence: l.content.trim().slice(0, 200),
                  recommendation: "Preserve backward compatibility or coordinate updates to all callers.",
                  confidence: 0.45
                })
              );
            }
          }
        }
      }
      return findings;
    }
  },
  {
    id: "api.status-code-changed",
    name: "Response status code changed",
    description: "An HTTP response status code was changed.",
    category: "compatibility",
    defaultSeverity: "low",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      const statusRe = /\.status\(\s*(\d{3})\s*\)|statusCode\s*=\s*(\d{3})/;
      for (const file of ctx.files) {
        if (file.category !== "api" || file.binary) continue;
        const removedCodes = new Set<string>();
        for (const l of removedLines(file.patch)) {
          const m = statusRe.exec(l.content);
          if (m) removedCodes.add(m[1] ?? m[2] ?? "");
        }
        for (const l of addedLines(file.patch)) {
          const m = statusRe.exec(l.content);
          const code = m ? (m[1] ?? m[2] ?? "") : "";
          if (m && removedCodes.size > 0 && !removedCodes.has(code)) {
            findings.push(
              makeFinding({
                ruleId: "api.status-code-changed",
                title: "Response status code changed",
                description: "An HTTP response status code changed; clients keying on status may be affected.",
                severity: "low",
                category: "compatibility",
                file: file.path,
                ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                evidence: l.content.trim().slice(0, 200),
                recommendation: "Verify clients tolerate the new status code.",
                confidence: 0.35
              })
            );
            break;
          }
        }
      }
      return findings;
    }
  }
];
