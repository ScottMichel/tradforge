import type { ProviderConfig } from "../core/config.js";
import type { TranslationRequest } from "../core/provider.js";
import { estimateTokens } from "./llm/usage.js";

export interface UsageEstimate {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** In the currency of provider.pricing; absent without prices, or for a local model. */
  readonly cost?: number;
}

/**
 * What the planned requests of a run would use with this engine: an order of magnitude, before paying for it.
 * Retries are not counted: a run with many rejected answers costs more.
 */
export function estimateUsage(config: ProviderConfig, requests: readonly TranslationRequest[]): UsageEstimate {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const request of requests) {
    // Every engine so far is a language model; an engine billed per character (DeepL) will measure differently.
    const tokens = estimateTokens(request);
    inputTokens += tokens.inputTokens;
    outputTokens += tokens.outputTokens;
  }
  const pricing = config.type === "ollama" ? undefined : config.pricing;
  return {
    requests: requests.length,
    inputTokens,
    outputTokens,
    ...(pricing !== undefined
      ? { cost: (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000 }
      : {}),
  };
}
