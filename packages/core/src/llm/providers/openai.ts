import type { TestPlan } from "../../types/domain.js";
import type { AIAnalysisResult, ChangeAnalysisInput, LLMProvider, TestPlanInput } from "../types.js";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserPrompt } from "../prompt.js";
import { postJson, toAnalysisResult, toTestPlan, type HttpProviderOptions } from "./shared.js";

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * OpenAI-compatible provider. Works with any server exposing the
 * /v1/chat/completions API (OpenAI, LM Studio, vLLM, LiteLLM, etc.). The API
 * key is sent only in the Authorization header and never logged.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai";
  private readonly url: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: HttpProviderOptions) {
    const base = options.baseUrl.replace(/\/$/, "");
    // Accept base URLs with or without the /v1 suffix.
    this.url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    this.model = options.model;
    if (options.apiKey !== undefined) this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  private async chat(system: string, user: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.apiKey !== undefined && this.apiKey.length > 0) {
      headers["authorization"] = `Bearer ${this.apiKey}`;
    }
    const data = (await postJson(
      this.name,
      this.url,
      {
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      },
      headers,
      this.timeoutMs
    )) as OpenAIChatResponse;
    return data.choices?.[0]?.message?.content ?? "";
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
