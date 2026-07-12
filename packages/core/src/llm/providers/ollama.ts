import type { TestPlan } from "../../types/domain.js";
import type { AIAnalysisResult, ChangeAnalysisInput, LLMProvider, TestPlanInput } from "../types.js";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserPrompt } from "../prompt.js";
import { postJson, toAnalysisResult, toTestPlan, type HttpProviderOptions } from "./shared.js";

interface OllamaChatResponse {
  message?: { content?: string };
}

/**
 * Ollama provider. Talks to a local Ollama server's /api/chat endpoint with
 * `format: "json"` and `stream: false`. No API key required by default.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: HttpProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  private async chat(system: string, user: string): Promise<string> {
    const data = (await postJson(
      this.name,
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      },
      {},
      this.timeoutMs
    )) as OllamaChatResponse;
    return data.message?.content ?? "";
  }

  async analyzeChange(input: ChangeAnalysisInput): Promise<AIAnalysisResult> {
    const content = await this.chat(ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserPrompt(input));
    return toAnalysisResult(this.name, content);
  }

  async generateTestPlan(input: TestPlanInput): Promise<TestPlan> {
    const user = `Produce a JSON test plan (summary, scenarios, regressionAreas, assumptions, unknowns) for these changes and findings:\n${JSON.stringify(input)}`;
    const content = await this.chat("You produce concise, valid-JSON software test plans.", user);
    return toTestPlan(this.name, content);
  }
}
