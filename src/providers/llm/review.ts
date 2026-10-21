import { isObject } from "../../core/json.js";
import { languageName } from "../../core/languages.js";
import { BatchError, type Review, type ReviewRequest, VERDICTS } from "../../core/provider.js";

/** The answer of a review: one verdict and a short note per text. */
export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          verdict: { type: "string", enum: [...VERDICTS] },
          note: { type: "string" },
        },
        required: ["id", "verdict", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["reviews"],
  additionalProperties: false,
} as const;

/**
 * The judge compares two texts in the same language: the original, and the back-translation of its translation.
 * Easier than judging across languages, even for a small local model.
 */
export function buildReviewPrompt(request: ReviewRequest): { system: string; user: string } {
  const language = languageName(request.language);
  const system = [
    `You check translations. Each text below has an original in ${language}, and a back-translation into ${language} of its translation.`,
    "Compare their meaning, not their wording: a different but faithful wording is fine.",
    "",
    "For each text, give a verdict:",
    '- "same": the meaning is kept;',
    '- "nuance": the meaning is close, but a nuance, a tone or a detail is lost or added;',
    '- "different": the meaning changed (a negation, a number, a person, an action...).',
    `Add a short note in ${language} explaining the difference, or "ok" when there is none.`,
    "",
    'Answer only with JSON in this form, with one entry per text id: {"reviews":[{"id":0,"verdict":"same","note":"ok"}]}',
  ].join("\n");
  const user = JSON.stringify({
    texts: request.items.map((item) => ({
      id: item.id,
      original: item.original,
      back_translation: item.backTranslation,
    })),
  });
  return { system, user };
}

/** Reads {"reviews":[{"id":0,"verdict":"same","note":"..."}]}. Unknown ids and verdicts are ignored. */
export function parseReviews(content: string, expectedIds: readonly number[]): Map<number, Review> {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new BatchError("the review is not valid JSON", { cause: error });
  }
  const reviews: unknown = isObject(data) ? data.reviews : undefined;
  if (!Array.isArray(reviews)) throw new BatchError('the review has no "reviews" array');

  const expected = new Set(expectedIds);
  const result = new Map<number, Review>();
  const items: unknown[] = reviews;
  for (const item of items) {
    if (!isObject(item) || typeof item.id !== "number" || typeof item.note !== "string") continue;
    const verdict = VERDICTS.find((v) => v === item.verdict);
    if (verdict !== undefined && expected.has(item.id) && !result.has(item.id)) {
      result.set(item.id, { verdict, note: item.note });
    }
  }
  return result;
}
