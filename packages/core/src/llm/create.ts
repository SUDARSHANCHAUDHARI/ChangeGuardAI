import type { ChangeGuardConfig } from "../config/schema.js";
import { InvalidConfigurationError } from "../shared/errors.js";
import type { LLMProvider } from "./types.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAICompatibleProvider } from "./providers/openai.js";
import { MockProvider } from "./providers/mock.js";

export type ProviderEnv = Partial<
  Record<"CHANGEGUARD_PROVIDER" | "CHANGEGUARD_MODEL" | "CHANGEGUARD_BASE_URL" | "CHANGEGUARD_API_KEY", string>
>;

const DEFAULT_BASE_URL: Record<string, string> = {
  ollama: "http://localhost:11434",
  openai: "https://api.openai.com"
};

/**
 * Build an LLM provider from config, with environment variables taking
 * precedence. Neither model names nor API keys are hardcoded: the model must be
 * supplied via config `ai.model` or CHANGEGUARD_MODEL, otherwise this throws an
 * invalid-configuration error.
 */
export function createProvider(config: ChangeGuardConfig, env: ProviderEnv = process.env): LLMProvider {
  const providerName = (env.CHANGEGUARD_PROVIDER ?? config.ai.provider).toLowerCase();
  const model = env.CHANGEGUARD_MODEL ?? config.ai.model;
  const baseUrl = env.CHANGEGUARD_BASE_URL ?? config.ai.baseUrl ?? DEFAULT_BASE_URL[providerName];
  const apiKey = env.CHANGEGUARD_API_KEY;

  if (providerName === "mock") {
    return new MockProvider();
  }

  if (model === undefined || model.trim().length === 0) {
    throw new InvalidConfigurationError(
      "AI is enabled but no model is set. Set ai.model in config or CHANGEGUARD_MODEL."
    );
  }
  if (baseUrl === undefined) {
    throw new InvalidConfigurationError(`Unknown AI provider "${providerName}". Use ollama, openai, or mock.`);
  }

  const options = { baseUrl, model, ...(apiKey !== undefined ? { apiKey } : {}) };
  switch (providerName) {
    case "ollama":
      return new OllamaProvider(options);
    case "openai":
      return new OpenAICompatibleProvider(options);
    default:
      throw new InvalidConfigurationError(`Unknown AI provider "${providerName}". Use ollama, openai, or mock.`);
  }
}
