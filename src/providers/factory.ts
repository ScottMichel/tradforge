import type { ProviderConfig } from "../core/config.js";
import type { Provider } from "../core/provider.js";
import { createAnthropicProvider } from "./anthropic/provider.js";
import { createGeminiProvider } from "./gemini/provider.js";
import { createOllamaProvider } from "./ollama/provider.js";
import { createOpenAiCompatibleProvider } from "./openai-compatible/provider.js";

export interface ProviderDependencies {
  /** Where API keys are read. Default: process.env. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Injected in tests, so that they never need the network. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Builds the provider described by the configuration. */
export function createProvider(config: ProviderConfig, dependencies: ProviderDependencies = {}): Provider {
  const fetch = dependencies.fetch !== undefined ? { fetch: dependencies.fetch } : {};
  switch (config.type) {
    case "ollama":
      return createOllamaProvider({ host: config.host, model: config.model, ...fetch });
    case "openai-compatible": {
      // The key is read here, in an adapter: the configuration only names the variable, the core never sees it.
      const apiKey = (dependencies.env ?? process.env)[config.apiKeyEnv];
      return createOpenAiCompatibleProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKeyEnv: config.apiKeyEnv,
        responseFormat: config.responseFormat,
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...fetch,
      });
    }
    case "anthropic": {
      const apiKey = (dependencies.env ?? process.env)[config.apiKeyEnv];
      return createAnthropicProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKeyEnv: config.apiKeyEnv,
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...fetch,
      });
    }
    case "gemini": {
      const apiKey = (dependencies.env ?? process.env)[config.apiKeyEnv];
      return createGeminiProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKeyEnv: config.apiKeyEnv,
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...fetch,
      });
    }
    default: {
      // Exhaustiveness check: adding a type to PROVIDER_TYPES without a case here is a compile error.
      const unknown: never = config;
      throw new Error(`unknown provider type: ${String(unknown)}`);
    }
  }
}
