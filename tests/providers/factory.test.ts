import { describe, expect, it } from "vitest";
import type { OpenAiCompatibleProviderConfig } from "../../src/core/config.js";
import { createProvider } from "../../src/providers/factory.js";

const openAi: OpenAiCompatibleProviderConfig = {
  type: "openai-compatible",
  model: "llama-3.3-70b",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnv: "GROQ_API_KEY",
  responseFormat: "json-object",
};

/** Records the authorization header of the one request it receives. */
function recordingFetch() {
  const seen: { authorization?: string | null } = {};
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    seen.authorization = new Headers(init?.headers).get("authorization");
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"translations":[{"id":0,"translation":"Salut"}]}' } }] }),
    );
  };
  return { fetch, seen };
}

const request = { sourceLanguage: "en", targetLanguage: "fr", items: [{ id: 0, source: "Hi" }] };

describe("createProvider", () => {
  it("creates the provider described by the configuration", () => {
    const provider = createProvider({ type: "ollama", model: "mistral-small", host: "http://localhost:11434" });
    expect(provider.model).toBe("mistral-small");
  });

  it("reads the API key from the environment variable the configuration names", async () => {
    const { fetch, seen } = recordingFetch();
    const provider = createProvider(openAi, { env: { GROQ_API_KEY: "gsk-123", OPENAI_API_KEY: "sk-other" }, fetch });
    expect(provider.model).toBe("llama-3.3-70b");
    expect(await provider.translateBatch(request)).toEqual(new Map([[0, "Salut"]]));
    expect(seen.authorization).toBe("Bearer gsk-123");
  });

  it("creates Claude with the key of its environment variable", async () => {
    let key: string | null = null;
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      key = new Headers(init?.headers).get("x-api-key");
      const input = { translations: [{ id: 0, translation: "Salut" }] };
      return new Response(
        JSON.stringify({
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: "submit_translations", input }],
        }),
      );
    };
    const claude = createProvider(
      {
        type: "anthropic",
        model: "claude-haiku-5-5",
        baseUrl: "https://api.anthropic.com/v1",
        apiKeyEnv: "ANTHROPIC_API_KEY",
      },
      { env: { ANTHROPIC_API_KEY: "sk-ant-1" }, fetch },
    );
    expect(await claude.translateBatch(request)).toEqual(new Map([[0, "Salut"]]));
    expect(key).toBe("sk-ant-1");
  });

  it("creates Gemini with the key of its environment variable", async () => {
    let key: string | null = null;
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      key = new Headers(init?.headers).get("x-goog-api-key");
      const text = JSON.stringify({ translations: [{ id: 0, translation: "Salut" }] });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }));
    };
    const gemini = createProvider(
      {
        type: "gemini",
        model: "gemini-2.5-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKeyEnv: "GEMINI_API_KEY",
      },
      { env: { GEMINI_API_KEY: "AIza-1" }, fetch },
    );
    expect(await gemini.translateBatch(request)).toEqual(new Map([[0, "Salut"]]));
    expect(key).toBe("AIza-1");
  });

  it("works without a key, for local servers", async () => {
    const { fetch, seen } = recordingFetch();
    await createProvider(openAi, { env: {}, fetch }).translateBatch(request);
    expect(seen.authorization).toBeNull();
  });
});
