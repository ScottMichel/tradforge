import { describe, expect, it } from "vitest";
import { BatchError, type ReviewRequest } from "../../../src/core/provider.js";
import { type Completion, createLlmProvider } from "../../../src/providers/llm/provider.js";
import { buildReviewPrompt, parseReviews, REVIEW_SCHEMA } from "../../../src/providers/llm/review.js";

const request: ReviewRequest = {
  language: "en",
  items: [
    { id: 0, original: "Don't open the door.", backTranslation: "Open the door." },
    { id: 1, original: "Welcome back!", backTranslation: "Good return!" },
  ],
};

describe("review prompt", () => {
  it("asks to compare the meaning, in the language of the texts, and to say why", () => {
    const { system, user } = buildReviewPrompt(request);
    expect(system).toContain("English");
    expect(system).toMatch(/same.*nuance.*different/s);
    expect(system).toMatch(/meaning/);
    expect(JSON.parse(user)).toEqual({
      texts: [
        { id: 0, original: "Don't open the door.", back_translation: "Open the door." },
        { id: 1, original: "Welcome back!", back_translation: "Good return!" },
      ],
    });
  });

  it("constrains the answer to known verdicts", () => {
    const item = REVIEW_SCHEMA.properties.reviews.items;
    expect(item.properties.verdict.enum).toEqual(["same", "nuance", "different"]);
    expect(item.required).toEqual(["id", "verdict", "note"]);
  });
});

describe("parseReviews", () => {
  it("reads the verdicts, ignoring unknown ids, repeated ids and unknown verdicts", () => {
    const answer = JSON.stringify({
      reviews: [
        { id: 0, verdict: "different", note: "The negation is lost." },
        { id: 0, verdict: "same", note: "repeated" },
        { id: 1, verdict: "excellent", note: "not a verdict" },
        { id: 9, verdict: "same", note: "unknown id" },
      ],
    });
    expect(parseReviews(answer, [0, 1])).toEqual(
      new Map([[0, { verdict: "different", note: "The negation is lost." }]]),
    );
  });

  it("reports an unreadable answer as a batch error", () => {
    expect(() => parseReviews("Looks fine to me", [0])).toThrow(BatchError);
    expect(() => parseReviews('{"verdicts": []}', [0])).toThrow(BatchError);
  });
});

describe("review by a language model", () => {
  it("is available on every language model provider, through the same completion function", async () => {
    const seen: Completion[] = [];
    const provider = createLlmProvider("judge", async (completion) => {
      seen.push(completion);
      return JSON.stringify({
        reviews: [
          { id: 0, verdict: "different", note: "The negation is lost." },
          { id: 1, verdict: "nuance", note: "Awkward but close." },
        ],
      });
    });
    const reviews = await provider.review?.(request);
    expect(reviews?.get(0)).toEqual({ verdict: "different", note: "The negation is lost." });
    expect(seen[0]).toMatchObject({ schemaName: "reviews", schema: REVIEW_SCHEMA });
    expect(seen[0]?.expectedOutputTokens).toBeGreaterThan(0);
  });
});
