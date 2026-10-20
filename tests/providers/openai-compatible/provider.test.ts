import { describe, expect, it } from "vitest";
import { BatchError, ProviderUnavailableError, type TranslationRequest } from "../../../src/core/provider.js";
import {
  createOpenAiCompatibleProvider,
  type OpenAiCompatibleOptions,
} from "../../../src/providers/openai-compatible/provider.js";

const request: TranslationRequest = {
  sourceLanguage: "en",
  targetLanguage: "fr",
  items: [{ id: 0, source: "Hello" }],
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

const completion = (content: string | null, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content, ...extra } }],
    }),
  );

const goodAnswer = () => completion(JSON.stringify({ translations: [{ id: 0, translation: "Bonjour" }] }));

const apiError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message, type: "invalid_request_error" } }), { status });

function provider(fetch: typeof globalThis.fetch, options: Partial<OpenAiCompatibleOptions> = {}) {
  return createOpenAiCompatibleProvider({
    baseUrl: "https://api.example.com/v1",
    model: "gpt-test",
    apiKey: "sk-test",
    apiKeyEnv: "OPENAI_API_KEY",
    responseFormat: "json-schema",
    fetch,
    ...options,
  });
}

const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body));
const headersOf = (call: Call | undefined) => new Headers(call?.init?.headers);

describe("OpenAI-compatible provider", () => {
  it("sends a chat completion request with the key, the prompt and a strict JSON schema", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    const engine = provider(fetch, { baseUrl: "https://api.example.com/v1/" });

    expect(await engine.translateBatch(request)).toEqual(new Map([[0, "Bonjour"]]));
    expect(engine.model).toBe("gpt-test");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.com/v1/chat/completions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headersOf(calls[0]).get("authorization")).toBe("Bearer sk-test");

    const body = bodyOf(calls[0]);
    expect(body).toMatchObject({ model: "gpt-test", temperature: 0.3 });
    expect(body.stream).toBeUndefined();
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "translations", strict: true, schema: { type: "object", additionalProperties: false } },
    });
  });

  it("can ask for any JSON, or for nothing, when the server does not support schemas", async () => {
    const object = fakeFetch(goodAnswer);
    await provider(object.fetch, { responseFormat: "json-object" }).translateBatch(request);
    expect(bodyOf(object.calls[0]).response_format).toEqual({ type: "json_object" });

    const none = fakeFetch(goodAnswer);
    await provider(none.fetch, { responseFormat: "none" }).translateBatch(request);
    expect(bodyOf(none.calls[0]).response_format).toBeUndefined();
  });

  it("sends no authorization header without a key: local servers do not need one", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    await createOpenAiCompatibleProvider({
      baseUrl: "http://localhost:1234/v1",
      model: "qwen3-8b",
      apiKeyEnv: "OPENAI_API_KEY",
      responseFormat: "json-schema",
      fetch,
    }).translateBatch(request);
    expect(headersOf(calls[0]).has("authorization")).toBe(false);
  });

  it("stops and names the environment variable when the key is missing or refused", async () => {
    for (const status of [401, 403]) {
      const { fetch } = fakeFetch(() => apiError(status, "Incorrect API key provided"));
      const translating = provider(fetch, { apiKeyEnv: "MISTRAL_API_KEY" }).translateBatch(request);
      await expect(translating).rejects.toThrow(ProviderUnavailableError);
      await expect(translating).rejects.toThrow(/MISTRAL_API_KEY.*Incorrect API key provided/);
    }
  });

  it("never shows the key in an error message", async () => {
    const { fetch } = fakeFetch(() => apiError(401, "Incorrect API key provided: sk-test"));
    await expect(provider(fetch).translateBatch(request)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("sk-test") }),
    );
  });

  it("stops with a clear message when the model or the address is wrong", async () => {
    const { fetch } = fakeFetch(() => apiError(404, "The model `gpt-9` does not exist"));
    const translating = provider(fetch, { model: "gpt-9" }).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/"gpt-9".*https:\/\/api\.example\.com\/v1.*does not exist/);
  });

  it("stops with a clear message when the server cannot be reached", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const translating = provider(fetch, { baseUrl: "http://localhost:1234/v1" }).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/http:\/\/localhost:1234\/v1/);
  });

  it("stops on a request the server refuses, such as an unsupported answer format", async () => {
    const { fetch } = fakeFetch(() => apiError(400, "response_format json_schema is not supported"));
    const translating = provider(fetch).translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/responseFormat/);
  });

  it("reports a server error, a rate limit or an unreadable answer as a retryable batch error", async () => {
    const answers = [
      () => new Response("Bad gateway", { status: 502 }),
      () => apiError(429, "Rate limit reached"),
      () => new Response("<html>not json</html>"),
      () => completion("Sure! Bonjour"),
      () => new Response(JSON.stringify({ choices: [] })),
    ];
    for (const answer of answers) {
      await expect(provider(fakeFetch(answer).fetch).translateBatch(request)).rejects.toThrow(BatchError);
    }
  });

  it("treats a cut answer or a refusal as a batch error, so that smaller batches are tried", async () => {
    const cut = () =>
      new Response(
        JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"translations":[{"id":0,' } }] }),
      );
    await expect(provider(fakeFetch(cut).fetch).translateBatch(request)).rejects.toThrow(/too long|cut/);

    const refusal = () => completion(null, { refusal: "I can't help with that." });
    await expect(provider(fakeFetch(refusal).fetch).translateBatch(request)).rejects.toThrow(/refused.*can't help/);
  });

  it("gives up on a batch that takes too long, but lets a user interruption through as it is", async () => {
    const hanging: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    await expect(provider(hanging, { timeoutMs: 10 }).translateBatch(request)).rejects.toThrow(BatchError);

    const controller = new AbortController();
    const translating = provider(hanging).translateBatch(request, controller.signal);
    const reason = new Error("interrupted");
    controller.abort(reason);
    await expect(translating).rejects.toBe(reason);
  });
});
