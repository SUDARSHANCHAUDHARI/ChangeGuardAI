/**
 * Zod schemas for validating anything that crosses a trust boundary:
 * persisted JSON reports, config files, and AI responses.
 *
 * The inferred types are structurally compatible with the hand-written
 * interfaces in `domain.ts`.
 */
import { z } from "zod";

export const changeStatusSchema = z.enum(["added", "modified", "deleted", "renamed"]);

export const fileCategorySchema = z.enum([
  "source",
  "test",
  "authentication",
  "authorization",
  "api",
  "database",
  "migration",
  "dependency",
  "configuration",
  "ci",
  "infrastructure",
  "documentation",
  "generated",
  "unknown"
]);

export const findingSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);

export const findingCategorySchema = z.enum([
  "security",
  "reliability",
  "compatibility",
  "testing",
  "database",
  "configuration"
]);

export const findingSourceSchema = z.enum(["rule", "ai", "scanner"]);

export const changedFileSchema = z.object({
  path: z.string().min(1),
  previousPath: z.string().min(1).optional(),
  status: changeStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  patch: z.string(),
  language: z.string().optional(),
  category: fileCategorySchema,
  binary: z.boolean()
});

export const findingSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string(),
  severity: findingSeveritySchema,
  category: findingCategorySchema,
  file: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  evidence: z.string().min(1),
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
  source: findingSourceSchema
});

export const repositoryInfoSchema = z.object({
  root: z.string().min(1),
  currentBranch: z.string().optional(),
  baseBranch: z.string().min(1),
  packageManager: z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]).optional(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  testFrameworks: z.array(z.string()),
  monorepo: z.boolean(),
  databaseTools: z.array(z.string()),
  apiFrameworks: z.array(z.string()),
  ciConfigured: z.boolean(),
  github: z
    .object({
      owner: z.string().min(1),
      name: z.string().min(1)
    })
    .optional()
});

export const riskContributionSchema = z.object({
  reason: z.string().min(1),
  points: z.number(),
  source: z.string().optional()
});

export const riskResultSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(["low", "moderate", "high", "critical"]),
  contributions: z.array(riskContributionSchema),
  recommendation: z.enum(["merge", "review", "request_changes", "block"])
});

export const testScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  priority: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum([
    "smoke",
    "functional",
    "negative",
    "security",
    "regression",
    "compatibility",
    "database-migration",
    "performance",
    "concurrency",
    "observability",
    "rollback"
  ]),
  preconditions: z.array(z.string()),
  steps: z.array(z.string()),
  expectedResults: z.array(z.string()),
  relatedFiles: z.array(z.string()),
  relatedFindings: z.array(z.string())
});

export const testPlanSchema = z.object({
  summary: z.string(),
  scenarios: z.array(testScenarioSchema),
  regressionAreas: z.array(z.string()),
  assumptions: z.array(z.string()),
  unknowns: z.array(z.string())
});

export const analysisResultSchema = z.object({
  repository: repositoryInfoSchema,
  changedFiles: z.array(changedFileSchema),
  findings: z.array(findingSchema),
  affectedAreas: z.array(z.string()),
  risk: riskResultSchema,
  testPlan: testPlanSchema,
  generatedAt: z.string()
});

export type ChangedFileInput = z.infer<typeof changedFileSchema>;
export type FindingInput = z.infer<typeof findingSchema>;
export type AnalysisResultInput = z.infer<typeof analysisResultSchema>;
