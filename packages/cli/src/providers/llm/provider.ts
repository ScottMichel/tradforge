import type { Provider } from "../../core/provider.js";
import { buildSystemPrompt, buildUserMessage } from "./prompt.js";
import { parseTranslations, RESPONSE_SCHEMA } from "./response.js";
import { buildReviewPrompt, parseReviews, REVIEW_SCHEMA } from "./review.js";
import { estimateTokens } from "./usage.js";

/** One exchange with a language model: instructions, a message, and the JSON schema the answer must follow. */
export interface Completion {
  readonly system: string;
  readonly user: string;
  /** Names the answer, for the APIs that want a name: "translations". */
  readonly schemaName: string;
  readonly schema: object;
  /** Expected size of the answer, for the APIs that need a limit (Claude's max_tokens). */
  readonly expectedOutputTokens: number;
}

/**
 * What an adapter for a language model implements: send one completion, return the JSON text of the answer.
 * Errors follow the Provider port (ProviderUnavailableError, BatchError, RateLimitError, TimeoutError).
 */
export type Complete = (completion: Completion, signal?: AbortSignal) => Promise<string>;

/**
 * A provider for any language model, from the one function that talks to its API. The tasks (translating, and
 * later judging) are written once here, for every engine.
 */
export function createLlmProvider(model: string, complete: Complete): Provider {
  return {
    model,
    async translateBatch(request, signal) {
      const text = await complete(
        {
          system: buildSystemPrompt(request),
          user: buildUserMessage(request),
          schemaName: "translations",
          schema: RESPONSE_SCHEMA,
          expectedOutputTokens: estimateTokens(request).outputTokens,
        },
        signal,
      );
      return parseTranslations(
        text,
        request.items.map((item) => item.id),
      );
    },
    async review(request, signal) {
      const { system, user } = buildReviewPrompt(request);
      const text = await complete(
        {
          system,
          user,
          schemaName: "reviews",
          schema: REVIEW_SCHEMA,
          // A verdict and a short note per text.
          expectedOutputTokens: 40 * request.items.length + 20,
        },
        signal,
      );
      return parseReviews(
        text,
        request.items.map((item) => item.id),
      );
    },
  };
}
