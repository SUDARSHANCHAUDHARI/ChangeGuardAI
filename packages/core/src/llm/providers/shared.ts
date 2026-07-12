import { InvalidAIResponseError, ProviderUnavailableError } from "../../shared/errors.js";
import { aiAnalysisResponseSchema, type AIAnalysisResult } from "../types.js";
import { testPlanSchema } from "../../types/schemas.js";
import type { TestPlan } from "../../types/domain.js";
import { parseJsonObject } from "../json.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface HttpProviderOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

/** POST JSON with a hard timeout; maps transport failures to ProviderUnavailable. */
export async function postJson(
  provider: string,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new ProviderUnavailableError(provider, new Error(`HTTP ${res.status} from ${redactUrl(url)}`));
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    throw new ProviderUnavailableError(provider, err);
  } finally {
    clearTimeout(timer);
  }
}

export function toAnalysisResult(provider: string, content: string): AIAnalysisResult {
  let parsed: unknown;
  try {
    parsed = parseJsonObject(content);
  } catch (err) {
    throw new InvalidAIResponseError(`${provider}: ${err instanceof Error ? err.message : String(err)}`, err);
  }
  const result = aiAnalysisResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidAIResponseError(
      `${provider}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }
  return { findings: result.data.findings };
}

export function toTestPlan(provider: string, content: string): TestPlan {
  let parsed: unknown;
  try {
    parsed = parseJsonObject(content);
  } catch (err) {
    throw new InvalidAIResponseError(`${provider}: ${err instanceof Error ? err.message : String(err)}`, err);
  }
  const result = testPlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidAIResponseError(`${provider}: test plan did not match schema`);
  }
  return result.data;
}

/** Strip any credentials from a URL before it appears in an error message. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return url;
  }
}
