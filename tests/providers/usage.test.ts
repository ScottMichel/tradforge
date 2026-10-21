import { describe, expect, it } from "vitest";
import type { OpenAiCompatibleProviderConfig } from "../../src/core/config.js";
import type { TranslationRequest } from "../../src/core/provider.js";
import { buildSystemPrompt, buildUserMessage } from "../../src/providers/llm/prompt.js";
import { estimateTokens } from "../../src/providers/llm/usage.js";
import { estimateUsage } from "../../src/providers/usage.js";

const request = (sources: string[], extra: Partial<TranslationRequest> = {}): TranslationRequest => ({
  sourceLanguage: "en",
  targetLanguage: "fr",
  items: sources.map((source, id) => ({ id, source })),
  ...extra,
});

const openAi: OpenAiCompatibleProviderConfig = {
  type: "openai-compatible",
  model: "gpt-test",
  baseUrl: "https://api.example.com/v1",
  apiKeyEnv: "OPENAI_API_KEY",
  responseFormat: "json-schema",
};

describe("estimateTokens", () => {
  it("measures the real prompt: instructions, glossary and texts are all paid for", () => {
    const sent = request(["Where is the NPC?"], { instructions: "Casual tone.", glossary: { NPC: "PNJ" } });
    const chars = buildSystemPrompt(sent).length + buildUserMessage(sent).length;
    const { inputTokens } = estimateTokens(sent);
    // About 3.5 characters per token, plus a little for each message: a rough but safe estimate.
    expect(inputTokens).toBeGreaterThanOrEqual(Math.ceil(chars / 3.5));
    expect(inputTokens).toBeLessThan(Math.ceil(chars / 3.5) + 20);
  });

  it("grows with the texts, and expects an answer a little longer than the sources", () => {
    const short = estimateTokens(request(["Hello"]));
    const long = estimateTokens(request(["Hello", "A much longer sentence that the model has to translate."]));
    expect(long.inputTokens).toBeGreaterThan(short.inputTokens);
    expect(long.outputTokens).toBeGreaterThan(short.outputTokens);
    const text = "x".repeat(350);
    expect(estimateTokens(request([text])).outputTokens).toBeGreaterThan(100);
  });
});

describe("estimateUsage", () => {
  const plan = [request(["Hello", "Bye"]), request(["Thanks"])];

  it("adds up the requests of a run", () => {
    const [first, second] = plan.map(estimateTokens);
    expect(estimateUsage(openAi, plan)).toStrictEqual({
      kind: "tokens",
      requests: 2,
      inputTokens: (first?.inputTokens ?? 0) + (second?.inputTokens ?? 0),
      outputTokens: (first?.outputTokens ?? 0) + (second?.outputTokens ?? 0),
    });
  });

  it("gives a cost when the configuration has the prices per million tokens", () => {
    const usage = estimateUsage({ ...openAi, pricing: { inputPerMillion: 2, outputPerMillion: 8 } }, plan);
    if (usage.kind !== "tokens") throw new Error("a language model is measured in tokens");
    expect(usage.cost).toBeCloseTo((usage.inputTokens * 2 + usage.outputTokens * 8) / 1_000_000, 10);
  });

  it("prices Claude the same way", () => {
    const claude = {
      type: "anthropic" as const,
      model: "claude-haiku-5-5",
      baseUrl: "https://api.anthropic.com/v1",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      pricing: { inputPerMillion: 1, outputPerMillion: 5 },
    };
    expect(estimateUsage(claude, plan).cost).toBeGreaterThan(0);
  });

  it("gives no cost for a local Ollama model", () => {
    const usage = estimateUsage({ type: "ollama", model: "mistral-small", host: "http://localhost:11434" }, plan);
    expect(usage.requests).toBe(2);
    expect(usage.cost).toBeUndefined();
  });

  it("counts the characters of the texts for DeepL, which bills them, and not the context", () => {
    const deepl = {
      type: "deepl" as const,
      model: "deepl" as const,
      apiKeyEnv: "DEEPL_API_KEY",
      formality: "default" as const,
    };
    const withContext = [
      request(["Hello", "Bye"], { instructions: "A long instruction that DeepL receives as free context." }),
      request(["Thanks"]),
    ];
    expect(estimateUsage(deepl, withContext)).toStrictEqual({ kind: "characters", requests: 2, characters: 14 });
    const priced = estimateUsage({ ...deepl, pricing: { perMillionCharacters: 25 } }, withContext);
    expect(priced.cost).toBeCloseTo((14 * 25) / 1_000_000, 12);
  });
});
