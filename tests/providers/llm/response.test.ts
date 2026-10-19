import { describe, expect, it } from "vitest";
import { BatchError } from "../../../src/core/provider.js";
import { parseTranslations } from "../../../src/providers/llm/response.js";

const answer = (translations: unknown) => JSON.stringify({ translations });

describe("parseTranslations", () => {
  it("returns the translations by id", () => {
    const content = answer([
      { id: 0, translation: "Bonjour" },
      { id: 1, translation: "Au revoir" },
    ]);
    expect(parseTranslations(content, [0, 1])).toEqual(
      new Map([
        [0, "Bonjour"],
        [1, "Au revoir"],
      ]),
    );
  });

  it("accepts an answer wrapped in a Markdown code block", () => {
    const content = `\`\`\`json\n${answer([{ id: 0, translation: "Bonjour" }])}\n\`\`\``;
    expect(parseTranslations(content, [0])).toEqual(new Map([[0, "Bonjour"]]));
  });

  it("ignores unknown ids, non-text translations and repeated ids", () => {
    const content = answer([
      { id: 0, translation: "Bonjour" },
      { id: 0, translation: "Salut" },
      { id: 7, translation: "Intrus" },
      { id: 1, translation: 42 },
      "nonsense",
    ]);
    expect(parseTranslations(content, [0, 1])).toEqual(new Map([[0, "Bonjour"]]));
  });

  it.each([
    ["not JSON at all", /not valid JSON/],
    ['{"translations": "Bonjour"}', /"translations" array/],
    ["[1, 2]", /"translations" array/],
  ])("rejects %j as a retryable batch error", (content, message) => {
    expect(() => parseTranslations(content, [0])).toThrow(BatchError);
    expect(() => parseTranslations(content, [0])).toThrow(message);
  });
});
