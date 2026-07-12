import { z } from "zod";
import type { TestPlan } from "../types/domain.js";

/**
 * Compact, sanitized view of a single changed file passed to the model. Only a
 * bounded slice of the diff is included (see context-builder). Repository text
 * here is UNTRUSTED data, never instructions.
 */
export interface AIFileContext {
  path: string;
  status: string;
  category: string;
  additions: number;
  deletions: number;
  /** Truncated diff hunks. */
  hunks: string;
}

export interface ChangeAnalysisInput {
  repository: {
    languages: string[];
    frameworks: string[];
    apiFrameworks: string[];
    databaseTools: string[];
  };
  prTitle?: string;
  prBody?: string;
  files: AIFileContext[];
  /** Deterministic findings so the model can avoid repeating them. */
  deterministicFindings: Array<{ ruleId: string; title: string; file: string; severity: string }>;
}

export interface TestPlanInput {
  files: AIFileContext[];
  findings: Array<{ id: string; title: string; category: string; file: string; severity: string }>;
}

/**
 * Raw AI finding shape. Validated by `aiFindingSchema` before it is trusted;
 * `validate.ts` then applies the rejection rules and converts to a Finding.
 */
export const aiFindingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.enum(["security", "reliability", "compatibility", "testing", "database", "configuration"]),
  file: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  evidence: z.string().min(1).max(1000),
  recommendation: z.string().max(1000).default(""),
  confidence: z.number().min(0).max(1)
});

export type AIRawFinding = z.infer<typeof aiFindingSchema>;

export const aiAnalysisResponseSchema = z.object({
  findings: z.array(aiFindingSchema).max(100).default([])
});

export interface AIAnalysisResult {
  findings: AIRawFinding[];
}

/** The provider abstraction. AI is always optional; see docs/ai-providers.md. */
export interface LLMProvider {
  name: string;
  analyzeChange(input: ChangeAnalysisInput): Promise<AIAnalysisResult>;
  generateTestPlan(input: TestPlanInput): Promise<TestPlan>;
}
