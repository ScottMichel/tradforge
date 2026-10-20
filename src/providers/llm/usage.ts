import type { TranslationRequest } from "../../core/provider.js";
import { buildSystemPrompt, buildUserMessage } from "./prompt.js";

export interface TokenEstimate {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Tokenizers differ from model to model, and none ships with Node.js. About 4 characters make a token in English
 * text; JSON, accents and other scripts need more tokens. 3.5 errs on the side of a higher estimate.
 */
const CHARS_PER_TOKEN = 3.5;

/** The chat format adds a few tokens around each of the two messages. */
const MESSAGE_OVERHEAD_TOKENS = 4;

/** Translations are usually longer than English sources (French: +15 to 30 %). */
const EXPANSION = 1.3;

/** The tokens a request to a language model sends and receives, measured on the real prompt. */
export function estimateTokens(request: TranslationRequest): TokenEstimate {
  const sent = buildSystemPrompt(request).length + buildUserMessage(request).length;
  const answer = JSON.stringify({
    translations: request.items.map((item) => ({
      id: item.id,
      translation: "x".repeat(Math.ceil(item.source.length * EXPANSION)),
    })),
  }).length;
  return {
    inputTokens: Math.ceil(sent / CHARS_PER_TOKEN) + 2 * MESSAGE_OVERHEAD_TOKENS,
    outputTokens: Math.ceil(answer / CHARS_PER_TOKEN),
  };
}
