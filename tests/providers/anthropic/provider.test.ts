import { describe, expect, it } from "vitest";
import {
  BatchError,
  ProviderUnavailableError,
  RateLimitError,
  type TranslationRequest,
} from "../../../src/core/provider.js";
import { type AnthropicOptions, createAnthropicProvider } from "../../../src/providers/anthropic/provider.js";

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

/** A fetch that never touches the network: it records the call and answers with the handler. */
function fakeFetch(handler: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return handler();
  };
  return { fetch, calls };
}

/** An answer of the Messages API in which Claude called the translation tool. */
const toolAnswer = (input: unknown, stopReason = "tool_use") =>
  new Response(
    JSON.stringify({
      type: "message",
      role: "assistant",
      stop_reason: stopReason,
      content: [{ type: "tool_use", id: "toolu_1", name: "submit_translations", input }],
    }),
  );

const goodAnswer = () => toolAnswer({ translations: [{ id: 0, translation: "Salut" }] });

const apiError = (status: number, type: string, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: "error", error: { type, message } }), { status, headers });

function provider(fetch: typeof globalThis.fetch, options: Partial<AnthropicOptions> = {}) {
  return createAnthropicProvider({
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-test",
    apiKey: "sk-ant-test",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    fetch,
    ...options,
  });
}

const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body));
const headersOf = (call: Call | undefined) => new Headers(call?.init?.headers);

describe("Anthropic provider", () => {
  it("sends a Messages API request that forces the translation tool", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    const engine = provider(fetch, { baseUrl: "https://api.anthropic.com/v1/" });

    expect(await engine.translateBatch(request)).toEqual(new Map([[0, "Salut"]]));
    expect(engine.model).toBe("claude-test");
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = headersOf(calls[0]);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.has("authorization")).toBe(false);

    const body = bodyOf(calls[0]);
    expect(body).toMatchObject({ model: "claude-test", temperature: 0.3 });
    expect(body.system).toContain("Casual tone."); // the system prompt is a field of its own
    expect(body.messages).toEqual([{ role: "user", content: expect.stringContaining('"Hello"') }]);
    expect(body.tools).toEqual([
      expect.objectContaining({
        name: "submit_translations",
        input_schema: expect.objectContaining({ type: "object" }),
      }),
    ]);
    expect(body.tool_choice).toEqual({ type: "tool", name: "submit_translations" });
  });

  it("asks for enough tokens for the answer, more for a larger batch", async () => {
    const small = fakeFetch(goodAnswer);
    await provider(small.fetch).translateBatch(request);
    const large = fakeFetch(goodAnswer);
    const sentence = "A sentence of a reasonable length, as games and applications often have, with a comma.";
    const texts = Array.from({ length: 50 }, (_, id) => ({ id, source: sentence }));
    await provider(large.fetch).translateBatch({ ...request, items: texts });
    const smallMax = bodyOf(small.calls[0]).max_tokens;
    expect(smallMax).toBeGreaterThanOrEqual(1024);
    expect(bodyOf(large.calls[0]).max_tokens).toBeGreaterThan(smallMax);
  });

  it("ignores unknown ids and reports an answer without the tool as a batch error", async () => {
    const extra = fakeFetch(() =>
      toolAnswer({
        translations: [
          { id: 0, translation: "Salut" },
          { id: 7, translation: "?" },
        ],
      }),
    );
    expect(await provider(extra.fetch).translateBatch(request)).toEqual(new Map([[0, "Salut"]]));

    const textOnly = () =>
      new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "Salut" }] }));
    const wrongShape = () => toolAnswer({ result: "Salut" });
    for (const answer of [textOnly, wrongShape, () => new Response("not json")]) {
      await expect(provider(fakeFetch(answer).fetch).translateBatch(request)).rejects.toThrow(BatchError);
    }
  });

  it("treats a cut answer or a refusal as a batch error, so that smaller batches are tried", async () => {
    const cut = () => toolAnswer({ translations: [] }, "max_tokens");
    await expect(provider(fakeFetch(cut).fetch).translateBatch(request)).rejects.toThrow(/too long|cut/);
    const refusal = () => new Response(JSON.stringify({ stop_reason: "refusal", content: [] }));
    await expect(provider(fakeFetch(refusal).fetch).translateBatch(request)).rejects.toThrow(/refused/);
  });

  it("stops and names the environment variable when the key is refused, without showing it", async () => {
    const { fetch } = fakeFetch(() => apiError(401, "authentication_error", "invalid x-api-key sk-ant-test"));
    const translating = provider(fetch, { apiKeyEnv: "MY_CLAUDE_KEY" }).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/MY_CLAUDE_KEY/);
    await expect(translating).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("sk-ant-test") }),
    );
  });

  it("stops when the key is missing, before sending anything", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    const engine = createAnthropicProvider({
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-test",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      fetch,
    });
    await expect(engine.translateBatch(request)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("stops on a wrong model or a refused request, such as a low credit balance", async () => {
    const notFound = fakeFetch(() => apiError(404, "not_found_error", "model: claude-9"));
    await expect(provider(notFound.fetch, { model: "claude-9" }).translateBatch(request)).rejects.toThrow(
      /"claude-9".*claude-9/,
    );
    const credit = fakeFetch(() => apiError(400, "invalid_request_error", "Your credit balance is too low"));
    const translating = provider(credit.fetch).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/credit balance/);
  });

  it("waits when the API is rate limited or overloaded, and retries smaller on a server error", async () => {
    const limited = fakeFetch(() => apiError(429, "rate_limit_error", "Number of requests", { "retry-after": "12" }));
    const error: unknown = await provider(limited.fetch)
      .translateBatch(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error instanceof RateLimitError ? error.retryAfterMs : undefined).toBe(12_000);

    const overloaded = fakeFetch(() => apiError(529, "overloaded_error", "Overloaded"));
    await expect(provider(overloaded.fetch).translateBatch(request)).rejects.toThrow(RateLimitError);

    const failed = fakeFetch(() => apiError(500, "api_error", "Internal server error"));
    await expect(provider(failed.fetch).translateBatch(request)).rejects.toThrow(BatchError);
  });

  it("stops with a clear message when the API cannot be reached", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const translating = provider(fetch).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/api\.anthropic\.com/);
  });
});
