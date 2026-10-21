import { describe, expect, it } from "vitest";
import {
  BatchError,
  ProviderUnavailableError,
  RateLimitError,
  type TranslationRequest,
} from "../../../src/core/provider.js";
import {
  createDeepLProvider,
  type DeepLOptions,
  deeplSourceLanguage,
  deeplTargetLanguage,
  escapeXml,
  unescapeXml,
} from "../../../src/providers/deepl/provider.js";

const request = (sources: string[], extra: Partial<TranslationRequest> = {}): TranslationRequest => ({
  sourceLanguage: "en",
  targetLanguage: "fr",
  items: sources.map((source, id) => ({ id, source })),
  ...extra,
});

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
  readonly headers: Headers;
}

/**
 * A fake DeepL: it translates by adding "[fr] ", keeps the glossaries it was given, and answers with the handler
 * when one is given for this path.
 */
function fakeDeepL(handlers: Record<string, () => Response> = {}) {
  const calls: Call[] = [];
  const glossaries: { glossary_id: string; name: string }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const body: unknown = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ url: String(input), method: init?.method ?? "GET", body, headers: new Headers(init?.headers) });
    const handler = handlers[url.pathname];
    if (handler !== undefined) return handler();
    if (url.pathname === "/v2/glossaries" && init?.method === "GET") return Response.json({ glossaries });
    if (url.pathname === "/v2/glossaries") {
      const glossary = { glossary_id: `g${glossaries.length + 1}`, name: String((body as { name: string }).name) };
      glossaries.push(glossary);
      return Response.json(glossary, { status: 201 });
    }
    const texts = (body as { text: string[] }).text;
    return Response.json({
      translations: texts.map((text) => ({ detected_source_language: "EN", text: `[fr] ${text}` })),
    });
  };
  const translateCalls = () => calls.filter((call) => call.url.endsWith("/v2/translate"));
  return { fetch, calls, translateCalls, glossaries };
}

function provider(fetch: typeof globalThis.fetch, options: Partial<DeepLOptions> = {}) {
  return createDeepLProvider({
    model: "deepl",
    apiKey: "k-pro",
    apiKeyEnv: "DEEPL_API_KEY",
    formality: "default",
    fetch,
    ...options,
  });
}

const bodyOf = (call: Call | undefined): Record<string, unknown> => (call?.body ?? {}) as Record<string, unknown>;

describe("DeepL languages", () => {
  it("uses DeepL's codes: regional English and Portuguese as targets, base codes as sources", () => {
    expect(["fr", "fr-CA", "en", "en-GB", "pt", "pt-BR", "zh", "zh-TW", "de"].map(deeplTargetLanguage)).toEqual([
      "FR",
      "FR",
      "EN-US",
      "EN-GB",
      "PT-PT",
      "PT-BR",
      "ZH-HANS",
      "ZH-HANT",
      "DE",
    ]);
    expect(["en", "en-GB", "pt-BR", "fr"].map(deeplSourceLanguage)).toEqual(["EN", "EN", "PT", "FR"]);
  });
});

describe("XML escapes", () => {
  it("escapes the text around the protected tags, and only there", () => {
    const text = 'Tom & Jerry <x id="0"/> 3 < 5 > 2';
    expect(escapeXml(text)).toBe('Tom &amp; Jerry <x id="0"/> 3 &lt; 5 &gt; 2');
    expect(unescapeXml(escapeXml(text))).toBe(text);
    expect(unescapeXml("&quot;Go&quot; &apos;now&apos; &amp;amp;")).toBe("\"Go\" 'now' &amp;");
  });
});

describe("DeepL provider", () => {
  it("sends the texts with DeepL's languages, XML tag handling for the protected tags, and the key", async () => {
    const { fetch, translateCalls } = fakeDeepL();
    const engine = provider(fetch);
    expect(engine.protectPlaceholders).toBe(true); // DeepL cannot be told in words to keep {name}
    expect(engine.model).toBe("deepl");

    const answer = await engine.translateBatch(request(['Hello <x id="0"/>!', "Bye"]));
    expect(answer).toEqual(
      new Map([
        [0, '[fr] Hello <x id="0"/>!'],
        [1, "[fr] Bye"],
      ]),
    );
    const call = translateCalls()[0];
    expect(call?.url).toBe("https://api.deepl.com/v2/translate");
    expect(call?.headers.get("authorization")).toBe("DeepL-Auth-Key k-pro");
    expect(bodyOf(call)).toMatchObject({
      text: ['Hello <x id="0"/>!', "Bye"],
      source_lang: "EN",
      target_lang: "FR",
      tag_handling: "xml",
      ignore_tags: ["x"],
    });
    expect(bodyOf(call)).not.toHaveProperty("formality");
    expect(bodyOf(call)).not.toHaveProperty("model_type");
  });

  it("uses the free address for a free key, unless an address is configured", async () => {
    const free = fakeDeepL();
    await provider(free.fetch, { apiKey: "k:fx" }).translateBatch(request(["Hi"]));
    expect(free.translateCalls()[0]?.url).toBe("https://api-free.deepl.com/v2/translate");

    const proxy = fakeDeepL();
    await provider(proxy.fetch, { apiKey: "k:fx", baseUrl: "https://deepl.example.com/" }).translateBatch(
      request(["Hi"]),
    );
    expect(proxy.translateCalls()[0]?.url).toBe("https://deepl.example.com/v2/translate");
  });

  it("sends the formality and the model type when they are chosen", async () => {
    const { fetch, translateCalls } = fakeDeepL();
    await provider(fetch, { formality: "prefer_less", model: "quality_optimized" }).translateBatch(request(["Hi"]));
    expect(bodyOf(translateCalls()[0])).toMatchObject({ formality: "prefer_less", model_type: "quality_optimized" });
  });

  it("escapes what XML would misread, and gives the translation back as plain text", async () => {
    const { fetch, translateCalls } = fakeDeepL({
      "/v2/translate": () => Response.json({ translations: [{ text: 'Tom &amp; Jerry <x id="0" /> 3 &lt; 5' }] }),
    });
    const answer = await provider(fetch).translateBatch(request(['Tom & Jerry <x id="0"/> 3 < 5']));
    expect(bodyOf(translateCalls()[0]).text).toEqual(['Tom &amp; Jerry <x id="0"/> 3 &lt; 5']);
    expect(answer.get(0)).toBe('Tom & Jerry <x id="0" /> 3 < 5'); // the pipeline accepts this form of the tag
  });

  it("gives the instructions, the contexts and the surrounding lines as DeepL context, which is not billed", async () => {
    const { fetch, translateCalls } = fakeDeepL();
    await provider(fetch).translateBatch({
      ...request(["Fine, thanks."]),
      items: [{ id: 0, source: "Fine, thanks.", context: "dialogue with a soldier" }],
      instructions: "Casual video game tone.",
      surrounding: { before: [{ source: "How are you?", translation: "Ça va ?" }], after: [{ source: "Good." }] },
    });
    const context = String(bodyOf(translateCalls()[0]).context);
    for (const part of ["Casual video game tone.", "dialogue with a soldier", "How are you?", "Good."]) {
      expect(context).toContain(part);
    }
  });

  it("sends at most 50 texts per request, and puts the answers back in order", async () => {
    const { fetch, translateCalls } = fakeDeepL();
    const sources = Array.from({ length: 120 }, (_, i) => `Text ${i}`);
    const answer = await provider(fetch).translateBatch(request(sources));
    expect(translateCalls().map((call) => (bodyOf(call).text as string[]).length)).toEqual([50, 50, 20]);
    expect(answer.get(0)).toBe("[fr] Text 0");
    expect(answer.get(119)).toBe("[fr] Text 119");
  });

  it("reports an answer with a wrong number of translations as a batch error", async () => {
    const { fetch } = fakeDeepL({ "/v2/translate": () => Response.json({ translations: [{ text: "Un" }] }) });
    await expect(provider(fetch).translateBatch(request(["One", "Two"]))).rejects.toThrow(BatchError);
    const broken = fakeDeepL({ "/v2/translate": () => new Response("<html>") });
    await expect(provider(broken.fetch).translateBatch(request(["One"]))).rejects.toThrow(BatchError);
  });

  describe("glossary", () => {
    const glossary = { NPC: "PNJ", "Health\tbar": "skipped: a tab cannot be in a DeepL entry", HP: "PV" };

    it("creates a DeepL glossary once, named after its content, and uses it for every batch", async () => {
      const { fetch, calls, translateCalls, glossaries } = fakeDeepL();
      const engine = provider(fetch);
      await engine.translateBatch(request(["Talk to the NPC"], { glossary }));
      await engine.translateBatch(request(["Low HP"], { glossary }));

      const created = calls.filter((call) => call.url.endsWith("/v2/glossaries") && call.method === "POST");
      expect(created).toHaveLength(1);
      expect(bodyOf(created[0])).toMatchObject({
        source_lang: "en",
        target_lang: "fr",
        entries: "HP\tPV\nNPC\tPNJ",
        entries_format: "tsv",
      });
      expect(String(bodyOf(created[0]).name)).toMatch(/^tradforge en-fr [0-9a-f]{12}$/);
      expect(glossaries).toHaveLength(1);
      expect(translateCalls().map((call) => bodyOf(call).glossary_id)).toEqual(["g1", "g1"]);
    });

    it("reuses the glossary of a previous run instead of creating another one", async () => {
      const first = fakeDeepL();
      await provider(first.fetch).translateBatch(request(["NPC"], { glossary }));
      const name = first.glossaries[0]?.name ?? "";

      const second = fakeDeepL({
        "/v2/glossaries": () => Response.json({ glossaries: [{ glossary_id: "old", name }] }),
      });
      await provider(second.fetch).translateBatch(request(["NPC"], { glossary }));
      expect(second.calls.filter((call) => call.method === "POST" && call.url.endsWith("/glossaries"))).toEqual([]);
      expect(bodyOf(second.translateCalls()[0]).glossary_id).toBe("old");
    });

    it("sends no glossary when the project has none", async () => {
      const { fetch, calls } = fakeDeepL();
      await provider(fetch).translateBatch(request(["Hi"], { glossary: {} }));
      expect(calls.map((call) => call.url)).toEqual(["https://api.deepl.com/v2/translate"]);
    });

    it("stops with advice when DeepL cannot make a glossary for this language pair", async () => {
      const { fetch } = fakeDeepL({
        "/v2/glossaries": () => Response.json({ message: "Unsupported glossary language pair" }, { status: 400 }),
      });
      const translating = provider(fetch).translateBatch(request(["NPC"], { glossary }));
      await expect(translating).rejects.toThrow(ProviderUnavailableError);
      await expect(translating).rejects.toThrow(/glossary.*translation\.glossary/);
    });
  });

  describe("errors", () => {
    const failing = (status: number, message: string, headers: Record<string, string> = {}) =>
      fakeDeepL({ "/v2/translate": () => Response.json({ message }, { status, headers }) });

    it("stops when the key is missing, refused or sent to the wrong address, without showing it", async () => {
      const { fetch, calls } = fakeDeepL();
      const noKey = createDeepLProvider({ model: "deepl", apiKeyEnv: "DEEPL_API_KEY", formality: "default", fetch });
      await expect(noKey.translateBatch(request(["Hi"]))).rejects.toThrow(/DEEPL_API_KEY/);
      expect(calls).toEqual([]);

      const refused = failing(403, "Wrong endpoint. Use https://api-free.deepl.com (k-pro)");
      const translating = provider(refused.fetch, { apiKeyEnv: "MY_DEEPL" }).translateBatch(request(["Hi"]));
      await expect(translating).rejects.toThrow(ProviderUnavailableError);
      await expect(translating).rejects.toThrow(/MY_DEEPL.*:fx/);
      await expect(translating).rejects.toThrow(
        expect.objectContaining({ message: expect.not.stringContaining("k-pro") }),
      );
    });

    it("stops when the character quota is used up", async () => {
      const translating = provider(failing(456, "Quota exceeded").fetch).translateBatch(request(["Hi"]));
      await expect(translating).rejects.toThrow(ProviderUnavailableError);
      await expect(translating).rejects.toThrow(/quota/);
    });

    it("waits on a rate limit or an unavailable service, and retries smaller on a request too large", async () => {
      const limited = provider(failing(429, "Too many requests", { "retry-after": "3" }).fetch);
      const error: unknown = await limited.translateBatch(request(["Hi"])).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error instanceof RateLimitError ? error.retryAfterMs : undefined).toBe(3000);

      await expect(provider(failing(503, "Unavailable").fetch).translateBatch(request(["Hi"]))).rejects.toThrow(
        RateLimitError,
      );
      for (const status of [413, 500]) {
        await expect(provider(failing(status, "No").fetch).translateBatch(request(["Hi"]))).rejects.toThrow(BatchError);
      }
    });

    it("stops on a request DeepL refuses, such as an unsupported language", async () => {
      const translating = provider(failing(400, "Value for 'target_lang' not supported.").fetch).translateBatch(
        request(["Hi"]),
      );
      await expect(translating).rejects.toThrow(ProviderUnavailableError);
      await expect(translating).rejects.toThrow(/target_lang/);
    });
  });
});

describe("DeepL in the pipeline", () => {
  it("keeps placeholders, tags and XML characters through protection, escaping and validation", async () => {
    const { parseConfig } = await import("../../../src/core/config.js");
    const { TranslationMemory } = await import("../../../src/core/memory.js");
    const { translateSegments } = await import("../../../src/core/pipeline.js");
    const config = parseConfig({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sources: [{ format: "json", include: ["*.json"] }],
    });
    // A DeepL that translates word by word and moves the protected tags around, as a real one may.
    const words: Record<string, string> = {
      Hello: "Bonjour",
      Tom: "Tom",
      "&amp;": "&amp;",
      Jerry: "Jerry",
      "&lt;": "&lt;",
    };
    const { fetch, translateCalls } = fakeDeepL({
      "/v2/translate": () => {
        const texts = (bodyOf(translateCalls().at(-1)).text ?? []) as string[];
        const translated = texts.map((text) =>
          text
            .split(" ")
            .map((word) => words[word] ?? word.replace('"/>', '" />'))
            .join(" "),
        );
        return Response.json({ translations: translated.map((text) => ({ text })) });
      },
    });
    const memory = new TranslationMemory({ languages: config });
    const summary = await translateSegments({
      segments: ["Hello {name}, <b>Tom</b> & Jerry < %s"].map((source) => ({
        source,
        priority: 0,
        locations: [{ file: "ui.json" }],
      })),
      memory,
      provider: provider(fetch),
      config,
      save: async () => {},
    });
    expect(summary).toMatchObject({ translated: 1, failed: 0 });
    expect(bodyOf(translateCalls()[0]).text).toEqual([
      // Tags are numbered in the order of the text: {name} = 0, <b> = 1, </b> = 2, %s = 3.
      'Hello <x id="0"/>, <x id="1"/>Tom<x id="2"/> &amp; Jerry &lt; <x id="3"/>',
    ]);
    expect(memory.get("Hello {name}, <b>Tom</b> & Jerry < %s")?.target).toBe("Bonjour {name}, <b>Tom</b> & Jerry < %s");
  });
});
