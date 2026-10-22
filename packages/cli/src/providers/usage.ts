import type { ProviderConfig } from "../core/config.js";
import type { TranslationRequest } from "../core/provider.js";
import { estimateTokens } from "./llm/usage.js";

/** Language models bill tokens, sent and received; translation engines such as DeepL bill source characters. */
export type UsageEstimate =
  | {
      readonly kind: "tokens";
      readonly requests: number;
      readonly inputTokens: number;
      readonly outputTokens: number;
      /** In the currency of provider.pricing; absent without prices, or for a local model. */
      readonly cost?: number;
    }
  | {
      readonly kind: "characters";
      readonly requests: number;
      readonly characters: number;
      readonly cost?: number;
    };

/**
 * What the planned requests of a run would use with this engine: an order of magnitude, before paying for it.
 * Retries are not counted: a run with many rejected answers costs more.
 */
export function estimateUsage(config: ProviderConfig, requests: readonly TranslationRequest[]): UsageEstimate {
  if (config.type === "deepl") {
    // Only the texts are billed: the context parameter is free.
    const characters = requests.reduce(
      (sum, request) => sum + request.items.reduce((total, item) => total + item.source.length, 0),
      0,
    );
    const { pricing } = config;
    return {
      kind: "characters",
      requests: requests.length,
      characters,
      ...(pricing !== undefined ? { cost: (characters * pricing.perMillionCharacters) / 1_000_000 } : {}),
    };
  }

  let inputTokens = 0;
  let outputTokens = 0;
  for (const request of requests) {
    const tokens = estimateTokens(request);
    inputTokens += tokens.inputTokens;
    outputTokens += tokens.outputTokens;
  }
  const pricing = config.type === "ollama" ? undefined : config.pricing;
  return {
    kind: "tokens",
    requests: requests.length,
    inputTokens,
    outputTokens,
    ...(pricing !== undefined
      ? { cost: (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000 }
      : {}),
  };
}
