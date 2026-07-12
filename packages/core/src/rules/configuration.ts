import type { ChangeGuardRule } from "./types.js";
import { makeFinding } from "./types.js";
import { addedLines, removedLines } from "./patch.js";

const LIMIT =
  "Textual heuristic on changed config/CI lines. It reports what changed on the diff and cannot evaluate runtime effect.";

export const configurationRules: ChangeGuardRule[] = [
  {
    id: "configuration.environment-variable-added",
    name: "New environment variable referenced",
    description: "A new environment variable is read; deployments missing it may misbehave.",
    category: "configuration",
    defaultSeverity: "low",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      const envRe = /process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]|os\.environ\[['"]([A-Z0-9_]+)['"]\]/;
      for (const file of ctx.files) {
        if (file.binary) continue;
        const seen = new Set<string>();
        for (const l of addedLines(file.patch)) {
          const m = envRe.exec(l.content);
          const name = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
          if (name !== undefined && !seen.has(name)) {
            seen.add(name);
            findings.push(
              makeFinding({
                ruleId: "configuration.environment-variable-added",
                title: `New environment variable: ${name}`,
                description: `Code now reads \`${name}\`. Ensure it is documented and set in every environment.`,
                severity: "low",
                category: "configuration",
                file: file.path,
                ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                evidence: l.content.trim().slice(0, 200),
                recommendation: "Add the variable to .env.example, docs, and deployment configuration.",
                confidence: 0.5
              })
            );
          }
        }
      }
      return findings;
    }
  },
  {
    id: "configuration.production-default-changed",
    name: "Production default changed",
    description: "A default value guarding production behavior appears to have changed.",
    category: "configuration",
    defaultSeverity: "medium",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      const re = /\b(NODE_ENV|production|debug|DEBUG|LOG_LEVEL|ssl|secure)\b\s*[:=]/i;
      for (const file of ctx.files) {
        if (file.binary || (file.category !== "configuration" && file.category !== "source")) continue;
        const removedHits = removedLines(file.patch).some((l) => re.test(l.content));
        const addedHit = addedLines(file.patch).find((l) => re.test(l.content));
        if (removedHits && addedHit) {
          findings.push(
            makeFinding({
              ruleId: "configuration.production-default-changed",
              title: "Production default changed",
              description: "A configuration default that affects production behavior was modified.",
              severity: "medium",
              category: "configuration",
              file: file.path,
              ...(addedHit.newLine !== undefined ? { startLine: addedHit.newLine } : {}),
              evidence: addedHit.content.trim().slice(0, 200),
              recommendation: "Confirm the new default is safe for production and documented.",
              confidence: 0.4
            })
          );
        }
      }
      return findings;
    }
  },
  {
    id: "configuration.health-check-removed",
    name: "Health check removed",
    description: "A health/readiness endpoint or check appears to have been removed.",
    category: "configuration",
    defaultSeverity: "medium",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      const re = /\/(health|healthz|readyz|livez|ping|status)\b|healthCheck|readinessProbe|livenessProbe/i;
      for (const file of ctx.files) {
        if (file.binary || file.status === "added") continue;
        const removedCount = removedLines(file.patch).filter((l) => re.test(l.content)).length;
        const addedCount = addedLines(file.patch).filter((l) => re.test(l.content)).length;
        if (removedCount > addedCount) {
          const sample = removedLines(file.patch).find((l) => re.test(l.content));
          findings.push(
            makeFinding({
              ruleId: "configuration.health-check-removed",
              title: "Health check removed",
              description: "A health/readiness check was removed, which can break orchestration and monitoring.",
              severity: "medium",
              category: "configuration",
              file: file.path,
              ...(sample?.oldLine !== undefined ? { startLine: sample.oldLine } : {}),
              evidence: (sample?.content ?? "").trim().slice(0, 200),
              recommendation: "Restore the health check or update orchestration/monitoring accordingly.",
              confidence: 0.45
            })
          );
        }
      }
      return findings;
    }
  },
  {
    id: "configuration.feature-flag-default-changed",
    name: "Feature flag default changed",
    description: "A feature flag's default value appears to have changed.",
    category: "configuration",
    defaultSeverity: "medium",
    limitations: LIMIT,
    async evaluate(ctx) {
      const findings = [];
      const re = /\b(feature|flag|enable|isEnabled|toggle)[A-Za-z0-9_]*\s*[:=]\s*(true|false)/i;
      for (const file of ctx.files) {
        if (file.binary) continue;
        const removed = removedLines(file.patch).some((l) => re.test(l.content));
        const addedHit = addedLines(file.patch).find((l) => re.test(l.content));
        if (removed && addedHit) {
          findings.push(
            makeFinding({
              ruleId: "configuration.feature-flag-default-changed",
              title: "Feature flag default changed",
              description: "A feature flag default was flipped, changing behavior for users without explicit overrides.",
              severity: "medium",
              category: "configuration",
              file: file.path,
              ...(addedHit.newLine !== undefined ? { startLine: addedHit.newLine } : {}),
              evidence: addedHit.content.trim().slice(0, 200),
              recommendation: "Confirm the new default is intended and roll out gradually if risky.",
              confidence: 0.4
            })
          );
        }
      }
      return findings;
    }
  },
  {
    id: "configuration.deployment-workflow-changed",
    name: "Deployment workflow changed",
    description: "A CI/CD deployment workflow was modified.",
    category: "configuration",
    defaultSeverity: "low",
    limitations:
      "Fires when a CI-classified file changes and mentions deploy/release steps. It does not evaluate the safety of the change.",
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.category !== "ci" || file.binary) continue;
        const hit = addedLines(file.patch).find((l) => /\b(deploy|release|publish|kubectl|helm|terraform apply|aws |gcloud )\b/i.test(l.content));
        if (hit) {
          findings.push(
            makeFinding({
              ruleId: "configuration.deployment-workflow-changed",
              title: "Deployment workflow changed",
              description: "A deployment/release workflow step was modified; review its blast radius.",
              severity: "low",
              category: "configuration",
              file: file.path,
              ...(hit.newLine !== undefined ? { startLine: hit.newLine } : {}),
              evidence: hit.content.trim().slice(0, 200),
              recommendation: "Review the deployment change and test it in a staging pipeline first.",
              confidence: 0.4
            })
          );
        }
      }
      return findings;
    }
  }
];
