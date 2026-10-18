import type { ProviderConfig } from "../core/config.js";
import type { Provider } from "../core/provider.js";
import { createOllamaProvider } from "./ollama/provider.js";

/** Builds the provider described by the configuration. */
export function createProvider(config: ProviderConfig): Provider {
  switch (config.type) {
    case "ollama":
      return createOllamaProvider({ host: config.host, model: config.model });
    default: {
      // Exhaustiveness check: adding a type to PROVIDER_TYPES without a case here is a compile error.
      const unknownType: never = config.type;
      throw new Error(`unknown provider type: ${String(unknownType)}`);
    }
  }
}
