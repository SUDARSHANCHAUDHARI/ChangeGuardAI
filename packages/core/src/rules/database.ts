import type { ChangeGuardRule } from "./types.js";
import { addedLineRule } from "./factories.js";
import { makeFinding } from "./types.js";
import { addedLines } from "./patch.js";

const LIMIT_SQL =
  "Matches SQL keywords on added lines in migration/database files. It does not parse SQL or connect to a database, so it cannot confirm the statement's effect on real data.";

const isMigration = (cat: string): boolean => cat === "migration";
const isDbOrMigration = (cat: string): boolean => cat === "migration" || cat === "database";

export const databaseRules: ChangeGuardRule[] = [
  addedLineRule({
    id: "database.table-dropped",
    name: "Table dropped",
    description: "A DROP TABLE statement was added — a destructive, often irreversible operation.",
    category: "database",
    severity: "critical",
    only: (f) => isDbOrMigration(f.category),
    pattern: /\bDROP\s+TABLE\b/i,
    recommendation: "Confirm the table is unused, back up data, and plan a reversible migration.",
    confidence: 0.85,
    limitations: LIMIT_SQL
  }),
  addedLineRule({
    id: "database.column-dropped",
    name: "Column dropped",
    description: "A DROP COLUMN statement was added, which permanently removes data.",
    category: "database",
    severity: "high",
    only: (f) => isDbOrMigration(f.category),
    pattern: /\bDROP\s+COLUMN\b|\bdropColumn\b/i,
    recommendation: "Ensure no code reads this column; consider a deprecate-then-drop rollout.",
    confidence: 0.8,
    limitations: LIMIT_SQL
  }),
  addedLineRule({
    id: "database.non-null-column-without-default",
    name: "NOT NULL column added without default",
    description: "A NOT NULL column was added without a default, which fails on tables with existing rows.",
    category: "database",
    severity: "high",
    only: (f) => isDbOrMigration(f.category),
    pattern: /ADD\s+COLUMN\b(?=.*\bNOT\s+NULL\b)(?!.*\bDEFAULT\b)/i,
    recommendation: "Add a DEFAULT, or backfill in a separate step before enforcing NOT NULL.",
    confidence: 0.7,
    limitations: LIMIT_SQL
  }),
  addedLineRule({
    id: "database.unique-constraint-added",
    name: "Unique constraint added",
    description: "A UNIQUE constraint was added; it will fail if existing rows violate it.",
    category: "database",
    severity: "medium",
    only: (f) => isDbOrMigration(f.category),
    pattern: /\bADD\s+(CONSTRAINT\s+\w+\s+)?UNIQUE\b|\bCREATE\s+UNIQUE\s+INDEX\b/i,
    recommendation: "Verify existing data has no duplicates before adding the constraint.",
    confidence: 0.6,
    limitations: LIMIT_SQL
  }),
  {
    id: "database.index-removed",
    name: "Index removed",
    description: "A DROP INDEX statement was added; queries relying on it may slow down.",
    category: "database",
    defaultSeverity: "medium",
    limitations: LIMIT_SQL,
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (!isDbOrMigration(file.category) || file.binary) continue;
        for (const l of addedLines(file.patch)) {
          if (/\bDROP\s+INDEX\b|\bdropIndex\b/i.test(l.content)) {
            findings.push(
              makeFinding({
                ruleId: "database.index-removed",
                title: "Index removed",
                description: "An index was dropped; queries depending on it may regress in performance.",
                severity: "medium",
                category: "database",
                file: file.path,
                ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                evidence: l.content.trim().slice(0, 200),
                recommendation: "Confirm no hot query relies on this index; measure query plans.",
                confidence: 0.55
              })
            );
          }
        }
      }
      return findings;
    }
  },
  {
    id: "database.destructive-migration",
    name: "Destructive migration",
    description: "A migration contains a destructive statement (DROP/TRUNCATE/DELETE).",
    category: "database",
    defaultSeverity: "high",
    limitations: LIMIT_SQL,
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (!isMigration(file.category) || file.binary) continue;
        for (const l of addedLines(file.patch)) {
          if (/\b(TRUNCATE|DELETE\s+FROM|DROP\s+(TABLE|SCHEMA|DATABASE))\b/i.test(l.content)) {
            findings.push(
              makeFinding({
                ruleId: "database.destructive-migration",
                title: "Destructive migration",
                description: "This migration performs a destructive operation that can lose data.",
                severity: "high",
                category: "database",
                file: file.path,
                ...(l.newLine !== undefined ? { startLine: l.newLine } : {}),
                evidence: l.content.trim().slice(0, 200),
                recommendation: "Gate behind a backup, make it reversible, and test the down migration.",
                confidence: 0.75
              })
            );
          }
        }
      }
      return findings;
    }
  },
  addedLineRule({
    id: "database.unbounded-query-added",
    name: "Unbounded query added",
    description: "A findMany/SELECT without a limit was added, risking large result sets.",
    category: "reliability",
    severity: "low",
    only: (f) => f.category === "database" || f.category === "api" || f.category === "source",
    pattern: /\.findMany\(\s*\)|\.findAll\(\s*\)|SELECT\s+\*\s+FROM\s+\w+\s*;?\s*$/i,
    recommendation: "Add pagination or an explicit limit to bound the result set.",
    confidence: 0.4,
    limitations:
      "Flags calls with no visible limit on the changed line. It cannot see limits applied elsewhere or via defaults."
  })
];
