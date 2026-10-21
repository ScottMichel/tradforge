import type { ProviderConfig } from "../core/config.js";
import type { UsageEstimate } from "../providers/usage.js";

/** Two significant digits: an estimate does not deserve more, and tiny costs stay readable (0.00041). */
export const roughAmount = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 2 });

/** "free (local)", "about 0.42", or "no pricing" when provider.pricing is missing. */
export function costLabel(provider: ProviderConfig, usage: UsageEstimate): string {
  if (provider.type === "ollama") return "free (local)";
  return usage.cost === undefined ? "no pricing" : `about ${roughAmount.format(usage.cost)}`;
}
