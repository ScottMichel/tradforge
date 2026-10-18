import { describe, expect, it } from "vitest";
import { BatchError, ProviderUnavailableError, type TranslationRequest } from "../../../src/core/provider.js";
import { createOllamaProvider } from "../../../src/providers/ollama/provider.js";

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
function fakeFetch(handler: (init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return handler(init);
  };
  return { fetch, calls };
}

const chatAnswer = (content: string, status = 200) =>
  new Response(JSON.stringify({ message: { role: "assistant", content } }), { status });

const goodAnswer = () => chatAnswer(JSON.stringify({ translations: [{ id: 0, translation: "Bonjour" }] }));

/** A fetch that only ends when its signal aborts, like a model that takes forever. */
const hangingFetch: typeof globalThis.fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("Ollama provider", () => {
  it("sends one non-streamed chat request constrained by a JSON schema", async () => {
    const { fetch, calls } = fakeFetch(goodAnswer);
    const provider = createOllamaProvider({ host: "http://gpu-box:11434/", model: "mistral-small", fetch });

    expect(await provider.translateBatch(request)).toEqual(new Map([[0, "Bonjour"]]));
    expect(provider.model).toBe("mistral-small");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://gpu-box:11434/api/chat");
    expect(calls[0]?.init?.method).toBe("POST");

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body).toMatchObject({ model: "mistral-small", stream: false, options: { temperature: 0.3, num_ctx: 8192 } });
    expect(body.format).toMatchObject({ type: "object", required: ["translations"] });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });

  it("stops with a clear message when Ollama cannot be reached", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const provider = createOllamaProvider({ host: "http://localhost:11434", model: "mistral-small", fetch });
    const translating = provider.translateBatch(request);
    await expect(translating).rejects.toThrow(ProviderUnavailableError);
    await expect(translating).rejects.toThrow(/http:\/\/localhost:11434.*ollama serve/);
  });

  it("stops with a clear message when the model is not installed", async () => {
    const { fetch } = fakeFetch(() => new Response(JSON.stringify({ error: "model 'qwen9' not found" }), { status: 404 }));
    const provider = createOllamaProvider({ host: "http://localhost:11434", model: "qwen9", fetch });
    await expect(provider.translateBatch(request)).rejects.toThrow(/ollama pull qwen9/);
  });

  it("reports a server error or an unreadable answer as a retryable batch error", async () => {
    const serverError = fakeFetch(() => new Response("out of memory", { status: 500 }));
    const unreadable = fakeFetch(() => chatAnswer("Sure! Here are your translations: Bonjour"));
    for (const { fetch } of [serverError, unreadable]) {
      const provider = createOllamaProvider({ host: "http://localhost:11434", model: "m", fetch });
      await expect(provider.translateBatch(request)).rejects.toThrow(BatchError);
    }
  });

  it("gives up on a batch that takes too long, as a retryable batch error", async () => {
    const provider = createOllamaProvider({ host: "http://h", model: "m", fetch: hangingFetch, timeoutMs: 20 });
    await expect(provider.translateBatch(request)).rejects.toThrow(/did not answer within/);
  });

  it("lets a user interruption through as it is", async () => {
    const provider = createOllamaProvider({ host: "http://h", model: "m", fetch: hangingFetch });
    const controller = new AbortController();
    const translating = provider.translateBatch(request, controller.signal);
    controller.abort();
    await expect(translating).rejects.toMatchObject({ name: "AbortError" });
  });
});
