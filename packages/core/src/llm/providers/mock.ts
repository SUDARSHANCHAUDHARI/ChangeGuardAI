import type { TestPlan } from "../../types/domain.js";
import type {
  AIAnalysisResult,
  ChangeAnalysisInput,
  LLMProvider,
  TestPlanInput,
  AIRawFinding
} from "../types.js";

/**
 * Deterministic in-memory provider for tests and offline demos. It never makes
 * network calls. Supply canned findings, or a function computing them from the
 * input, to exercise the validation/merge pipeline.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";
  private readonly findings: (input: ChangeAnalysisInput) => AIRawFinding[];
  private readonly plan?: TestPlan;

  constructor(options: { findings?: AIRawFinding[] | ((input: ChangeAnalysisInput) => AIRawFinding[]); testPlan?: TestPlan } = {}) {
    const f = options.findings ?? [];
    this.findings = typeof f === "function" ? f : () => f;
    if (options.testPlan !== undefined) this.plan = options.testPlan;
  }

  async analyzeChange(input: ChangeAnalysisInput): Promise<AIAnalysisResult> {
    return { findings: this.findings(input) };
  }

  async generateTestPlan(_input: TestPlanInput): Promise<TestPlan> {
    return (
      this.plan ?? {
        summary: "Mock test plan.",
        scenarios: [],
        regressionAreas: [],
        assumptions: [],
        unknowns: []
      }
    );
  }
}
