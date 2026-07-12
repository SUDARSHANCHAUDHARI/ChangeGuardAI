import type { Finding } from "../types/domain.js";
import type { ChangeGuardRule, RuleContext } from "./types.js";
import { securityRules } from "./security.js";
import { apiRules } from "./api.js";
import { databaseRules } from "./database.js";
import { reliabilityRules } from "./reliability.js";
import { configurationRules } from "./configuration.js";
import { testingRules } from "./testing.js";

/** All built-in deterministic rules, in a stable order. */
export const allRules: ChangeGuardRule[] = [
  ...securityRules,
  ...apiRules,
  ...databaseRules,
  ...reliabilityRules,
  ...configurationRules,
  ...testingRules
];

export function getRuleById(id: string): ChangeGuardRule | undefined {
  return allRules.find((r) => r.id === id);
}

export interface RunRulesResult {
  findings: Finding[];
  /** Rules that threw, mapped to the error message. Analysis still completes. */
  errors: Array<{ ruleId: string; message: string }>;
}

/**
 * Execute every rule against the context. A rule that throws is isolated: its
 * error is recorded and the remaining rules still run. Findings are returned in
 * a deterministic order (rule order, then file, then line).
 */
export async function runRules(ctx: RuleContext, rules: ChangeGuardRule[] = allRules): Promise<RunRulesResult> {
  const findings: Finding[] = [];
  const errors: Array<{ ruleId: string; message: string }> = [];

  for (const rule of rules) {
    try {
      const produced = await rule.evaluate(ctx);
      for (const f of produced) findings.push(f);
    } catch (err) {
      errors.push({ ruleId: rule.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return (a.startLine ?? 0) - (b.startLine ?? 0);
  });

  return { findings, errors };
}
