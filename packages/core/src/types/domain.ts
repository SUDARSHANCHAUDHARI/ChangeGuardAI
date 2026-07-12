/**
 * Core domain types for ChangeGuard AI.
 *
 * These are the canonical TypeScript types. Runtime validation lives in
 * `types/schemas.ts` (Zod). Keep the two in sync — the Zod schemas are the
 * source of truth for anything that crosses a trust boundary (persisted JSON,
 * config files, AI responses).
 */

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export type FileCategory =
  | "source"
  | "test"
  | "authentication"
  | "authorization"
  | "api"
  | "database"
  | "migration"
  | "dependency"
  | "configuration"
  | "ci"
  | "infrastructure"
  | "documentation"
  | "generated"
  | "unknown";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "security"
  | "reliability"
  | "compatibility"
  | "testing"
  | "database"
  | "configuration";

export type FindingSource = "rule" | "ai" | "scanner";

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  patch: string;
  language?: string;
  category: FileCategory;
  binary: boolean;
}

export interface Finding {
  id: string;
  ruleId?: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  category: FindingCategory;
  file: string;
  startLine?: number;
  endLine?: number;
  evidence: string;
  recommendation: string;
  /** 0..1 */
  confidence: number;
  source: FindingSource;
}

export interface RepositoryInfo {
  root: string;
  currentBranch?: string;
  baseBranch: string;
  packageManager?: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
  languages: string[];
  frameworks: string[];
  testFrameworks: string[];
  monorepo: boolean;
  databaseTools: string[];
  apiFrameworks: string[];
  ciConfigured: boolean;
  github?: {
    owner: string;
    name: string;
  };
}

export type RiskLevel = "low" | "moderate" | "high" | "critical";

export type MergeRecommendation = "merge" | "review" | "request_changes" | "block";

export interface RiskContribution {
  reason: string;
  points: number;
  source?: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  contributions: RiskContribution[];
  recommendation: MergeRecommendation;
}

export type TestPriority = "critical" | "high" | "medium" | "low";

export type TestCategory =
  | "smoke"
  | "functional"
  | "negative"
  | "security"
  | "regression"
  | "compatibility"
  | "database-migration"
  | "performance"
  | "concurrency"
  | "observability"
  | "rollback";

export interface TestScenario {
  id: string;
  title: string;
  priority: TestPriority;
  category: TestCategory;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  relatedFiles: string[];
  relatedFindings: string[];
}

export interface TestPlan {
  summary: string;
  scenarios: TestScenario[];
  regressionAreas: string[];
  assumptions: string[];
  unknowns: string[];
}

export interface AnalysisResult {
  repository: RepositoryInfo;
  changedFiles: ChangedFile[];
  findings: Finding[];
  affectedAreas: string[];
  risk: RiskResult;
  testPlan: TestPlan;
  generatedAt: string;
}
