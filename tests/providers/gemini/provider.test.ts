import { describe, expect, it } from "vitest";
import {
  BatchError,
  ProviderUnavailableError,
  RateLimitError,
  type TranslationRequest,
} from "../../../src/core/provider.js";
import { createGeminiProvider, type GeminiOptions, geminiSchema } from "../../../src/providers/gemini/provider.js";
import { RESPONSE_SCHEMA } from "../../../src/providers/llm/response.js";

const request: TranslationRequest = {
  sourceLanguage: "en",
  targetLanguage: "fr",
  items: [{ id: 0, source: "Hello" }],
  instructions: "Casual tone.",
};

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fakeFetch(handler: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return handler();
  };
  return { fetch, calls };
}

/** A generateContent answer whose text is the given JSON. */
const answer = (text: string, finishReason = "STOP", extraParts: unknown[] = []) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { role: "model", parts: [...extraParts, { text }] }, finishReason }],
    }),
  );

const goodAnswer = () => answer(JSON.stringify({ translations: [{ id: 0, translation: "Salut" }] }));

/** Google errors: {"error": {"code", "message", "status", "details"}}. */
const apiError = (code: number, status: string, message: string, details: unknown[] = []) =>
  new Response(JSON.stringify({ error: { code, message, status, details } }), { status: code });

function provider(fetch: typeof globalThis.fetch, options: Partial<GeminiOptions> = {}) {
  return createGeminiProvider({
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-test",
    apiKey: "AIza-test",
    apiKeyEnv: "GEMINI_API_KEY",
    fetch,
    ...options,
  });
}

const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body));

describe("geminiSchema", () => {
  it("turns our JSON schema into the OpenAPI subset Gemini accepts", () => {
    expect(geminiSchema(RESPONSE_SCHEMA)).toEqual({
      type: "OBJECT",
      properties: {
        translations: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { id: { type: "INTEGER" }, translation: { type: "STRING" } },
            required: ["id", "translation"],
          },
        },
      },
      required: ["translations"],
    });
  });
});

describe("Gemini provider", () => {
  it("sends a generateContent request with the key in a header and a response schema", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    const engine = provider(fetch, { baseUrl: "https://generativelanguage.googleapis.com/v1beta/" });

    expect(await engine.translateBatch(request)).toEqual(new Map([[0, "Salut"]]));
    expect(engine.model).toBe("gemini-test");
    expect(calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(calls[0]?.url).not.toContain("AIza"); // never in the address, where proxies and logs would keep it
    expect(new Headers(calls[0]?.init?.headers).get("x-goog-api-key")).toBe("AIza-test");

    const body = bodyOf(calls[0]);
    expect(body.systemInstruction.parts[0].text).toContain("Casual tone.");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: expect.stringContaining('"Hello"') }] }]);
    expect(body.generationConfig).toMatchObject({
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT" },
    });
  });

  it("accepts a model name written with its models/ prefix", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    await provider(fetch, { model: "models/gemini-test" }).translateBatch(request);
    expect(calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  });

  it("reads the answer text, leaving out the thoughts of thinking models", async () => {
    const thinking = fakeFetch(() =>
      answer(JSON.stringify({ translations: [{ id: 0, translation: "Salut" }] }), "STOP", [
        { text: "Let me think about the tone...", thought: true },
      ]),
    );
    expect(await provider(thinking.fetch).translateBatch(request)).toEqual(new Map([[0, "Salut"]]));
  });

  it("treats a cut, blocked or empty answer as a batch error, so that smaller batches are tried", async () => {
    const cut = () => answer('{"translations":[{"id":0,', "MAX_TOKENS");
    await expect(provider(fakeFetch(cut).fetch).translateBatch(request)).rejects.toThrow(/too long|cut/);

    const blocked = () => answer("", "SAFETY");
    await expect(provider(fakeFetch(blocked).fetch).translateBatch(request)).rejects.toThrow(/blocked.*SAFETY/);

    const promptBlocked = () => new Response(JSON.stringify({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }));
    await expect(provider(fakeFetch(promptBlocked).fetch).translateBatch(request)).rejects.toThrow(
      /blocked.*PROHIBITED_CONTENT/,
    );

    for (const empty of [() => new Response("{}"), () => new Response("not json"), () => answer("Salut !")]) {
      await expect(provider(fakeFetch(empty).fetch).translateBatch(request)).rejects.toThrow(BatchError);
    }
  });

  it("stops when the key is missing or refused, naming the variable and hiding the key", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    const noKey = createGeminiProvider({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-test",
      apiKeyEnv: "GEMINI_API_KEY",
      fetch,
    });
    await expect(noKey.translateBatch(request)).rejects.toThrow(/GEMINI_API_KEY/);
    expect(calls).toHaveLength(0);

    // Google answers an invalid key with a 400, not a 401.
    const invalid = fakeFetch(() =>
      apiError(400, "INVALID_ARGUMENT", "API key not valid: AIza-test", [
        { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" },
      ]),
    );
    const translating = provider(invalid.fetch, { apiKeyEnv: "MY_GEMINI" }).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/MY_GEMINI/);
    await expect(translating).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("AIza-test") }),
    );
  });

  it("stops on a wrong model or a refused request", async () => {
    const notFound = fakeFetch(() => apiError(404, "NOT_FOUND", "models/gemini-9 is not found"));
    await expect(provider(notFound.fetch, { model: "gemini-9" }).translateBatch(request)).rejects.toThrow(
      /"gemini-9".*not found/,
    );
    const refused = fakeFetch(() => apiError(400, "INVALID_ARGUMENT", "Invalid JSON payload"));
    await expect(provider(refused.fetch).translateBatch(request)).rejects.toThrow(ProviderUnavailableError);
  });

  it("waits the delay Google gives on a rate limit, and waits as well when the model is overloaded", async () => {
    const limited = fakeFetch(() =>
      apiError(429, "RESOURCE_EXHAUSTED", "Quota exceeded for metric: requests per minute", [
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" },
      ]),
    );
    const error: unknown = await provider(limited.fetch)
      .translateBatch(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error instanceof RateLimitError ? error.retryAfterMs : undefined).toBe(21_000);

    const overloaded = fakeFetch(() => apiError(503, "UNAVAILABLE", "The model is overloaded"));
    await expect(provider(overloaded.fetch).translateBatch(request)).rejects.toThrow(RateLimitError);

    const failed = fakeFetch(() => apiError(500, "INTERNAL", "Internal error"));
    await expect(provider(failed.fetch).translateBatch(request)).rejects.toThrow(BatchError);
  });

  it("stops when the daily quota is used up: waiting a few seconds would not help", async () => {
    const daily = fakeFetch(() =>
      apiError(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota", [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "40s" },
      ]),
    );
    const translating = provider(daily.fetch).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/daily quota/);
  });

  it("stops with a clear message when the API cannot be reached", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(provider(fetch).translateBatch(request)).rejects.toThrow(/generativelanguage\.googleapis\.com/);
  });
});
