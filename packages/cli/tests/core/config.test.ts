import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_OUTPUT, parseConfig } from "../../src/core/config.js";

const minimal = {
  sourceLanguage: "en",
  targetLanguage: "fr",
  sources: [{ format: "json", include: ["locales/en/*.json"] }],
};

/** Runs parseConfig and returns the ConfigError it must throw. */
function configErrorOf(raw: unknown): ConfigError {
  try {
    parseConfig(raw);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error("expected parseConfig to throw a ConfigError");
}

const problemPaths = (raw: unknown): string[] => configErrorOf(raw).problems.map((p) => p.path);

describe("parseConfig", () => {
  it("applies defaults to a minimal config", () => {
    expect(parseConfig(minimal)).toStrictEqual({
      sourceLanguage: "en",
      targetLanguage: "fr",
      workDir: ".tradforge",
      sources: [
        {
          format: "json",
          include: ["locales/en/*.json"],
          priority: 0,
          group: "auto",
          output: {
            path: "{dir}/{name}.{lang}{ext}",
            asciiOnly: false,
            untranslated: "keep-source",
            encoding: "utf-8",
          },
          encoding: "auto",
        },
      ],
      provider: { type: "ollama", model: "mistral-small", host: "http://localhost:11434" },
      translation: { batchSize: 20, concurrency: 1, glossary: {}, contextLines: 3, typography: true, reuse: true },
      validation: {
        placeholders: ["braces", "printf", "positional", "bbcode", "ass", "timestamp", "markup"],
        glossary: true,
      },
    });
  });

  it("keeps the phase B settings: grouping, context, typography, reuse, glossary check", () => {
    const config = parseConfig({
      ...minimal,
      sources: [
        { format: "json", include: ["a"], group: "file" },
        { format: "json", include: ["b"], group: { keyPattern: "^(dialog_\\w+)_\\d+$" } },
      ],
      translation: { contextLines: 0, typography: false, reuse: false },
      validation: { glossary: false },
    });
    expect(config.sources.map((source) => source.group)).toEqual(["file", { keyPattern: "^(dialog_\\w+)_\\d+$" }]);
    expect(config.translation).toMatchObject({ contextLines: 0, typography: false, reuse: false });
    expect(config.validation.glossary).toBe(false);
  });

  it("keeps the encodings of the source files and of the outputs, and rejects unknown ones", () => {
    const config = parseConfig({
      ...minimal,
      sources: [
        {
          format: "json",
          include: ["a"],
          encoding: "windows-1251",
          output: { path: "{stem}{ext}", encoding: "utf-8-bom" },
        },
      ],
    });
    expect(config.sources[0]).toMatchObject({ encoding: "windows-1251", output: { encoding: "utf-8-bom" } });
    expect(
      problemPaths({
        ...minimal,
        sources: [{ format: "json", include: ["a"], encoding: "latin9", output: { encoding: "auto" } }],
      }),
    ).toEqual(["sources[0].encoding", "sources[0].output.encoding"]);
  });

  it("keeps the number of batches sent at once, at least 1", () => {
    expect(parseConfig({ ...minimal, translation: { concurrency: 4 } }).translation.concurrency).toBe(4);
    expect(problemPaths({ ...minimal, translation: { concurrency: 0 } })).toEqual(["translation.concurrency"]);
    expect(problemPaths({ ...minimal, translation: { concurrency: 2.5 } })).toEqual(["translation.concurrency"]);
  });

  it("rejects wrong grouping rules and phase B settings", () => {
    expect(
      problemPaths({
        ...minimal,
        sources: [
          { format: "json", include: ["a"], group: "sometimes" },
          { format: "json", include: ["b"], group: { keyPattern: "(unclosed" } },
        ],
        translation: { contextLines: -1, typography: "yes", reuse: 1 },
        validation: { glossary: "strict" },
      }),
    ).toEqual([
      "sources[0].group",
      "sources[1].group.keyPattern",
      "translation.contextLines",
      "translation.typography",
      "translation.reuse",
      "validation.glossary",
    ]);
  });

  it("keeps the given values and fills in the missing ones", () => {
    const config = parseConfig({
      ...minimal,
      workDir: "cache",
      provider: { model: "qwen3" },
      translation: { batchSize: 5, instructions: "Casual tone.", glossary: { NPC: "PNJ" } },
    });
    expect(config.workDir).toBe("cache");
    expect(config.provider).toStrictEqual({ type: "ollama", model: "qwen3", host: "http://localhost:11434" });
    expect(config.translation).toStrictEqual({
      batchSize: 5,
      concurrency: 1,
      instructions: "Casual tone.",
      glossary: { NPC: "PNJ" },
      contextLines: 3,
      typography: true,
      reuse: true,
    });
  });

  it.each([null, [], "en", 42])("rejects %j because it is not an object", (raw) => {
    expect(problemPaths(raw)).toEqual(["(root)"]);
  });

  it("reports every problem at once, with its path", () => {
    expect(
      problemPaths({
        targetLanguage: 3,
        sources: [{ format: "xml", include: [] }],
        provider: { type: "babelfish" },
        translation: { batchSize: 0 },
      }),
    ).toEqual([
      "sourceLanguage",
      "targetLanguage",
      "sources[0].format",
      "sources[0].include",
      "provider.type",
      "translation.batchSize",
    ]);
  });

  it("explains the problems in the error message", () => {
    const error = configErrorOf({ ...minimal, sources: [{ format: "xml", include: ["a"] }] });
    expect(error.message).toContain("sources[0].format");
    expect(error.message).toContain("json, lua");
  });

  it("requires at least one source", () => {
    expect(problemPaths({ ...minimal, sources: [] })).toEqual(["sources"]);
    expect(problemPaths({ sourceLanguage: "en", targetLanguage: "fr" })).toEqual(["sources"]);
  });

  it("keeps the priority and context of each source", () => {
    const config = parseConfig({
      ...minimal,
      sources: [
        { format: "lua", include: ["dialogues/*.lua"], priority: -1, context: "NPC dialogue lines" },
        { format: "json", include: ["ui/*.json"], priority: 5 },
      ],
    });
    expect(config.sources).toStrictEqual([
      {
        format: "lua",
        include: ["dialogues/*.lua"],
        priority: -1,
        context: "NPC dialogue lines",
        group: "auto",
        encoding: "auto",
        output: DEFAULT_OUTPUT,
      },
      { format: "json", include: ["ui/*.json"], priority: 5, group: "auto", encoding: "auto", output: DEFAULT_OUTPUT },
    ]);
  });

  it("rejects a priority that is not an integer and an empty context", () => {
    expect(
      problemPaths({
        ...minimal,
        sources: [
          { format: "json", include: ["a"], priority: 1.5 },
          { format: "json", include: ["b"], priority: "high", context: " " },
        ],
      }),
    ).toEqual(["sources[0].priority", "sources[1].priority", "sources[1].context"]);
  });

  it("keeps the chosen placeholder syntaxes, none included", () => {
    expect(parseConfig({ ...minimal, validation: { placeholders: ["braces"] } }).validation).toStrictEqual({
      placeholders: ["braces"],
      glossary: true,
    });
    expect(parseConfig({ ...minimal, validation: { placeholders: [] } }).validation.placeholders).toEqual([]);
  });

  it("rejects unknown placeholder syntaxes", () => {
    expect(problemPaths({ ...minimal, validation: { placeholders: ["braces", "icu"] } })).toEqual([
      "validation.placeholders[1]",
    ]);
    expect(problemPaths({ ...minimal, validation: { placeholders: "braces" } })).toEqual(["validation.placeholders"]);
  });

  it("keeps the output settings of each source", () => {
    const config = parseConfig({
      ...minimal,
      sources: [
        {
          format: "json",
          include: ["locales/en/*.json"],
          output: { path: "locales/{lang}/{name}{ext}", asciiOnly: true, untranslated: "omit" },
        },
      ],
    });
    expect(config.sources[0]?.output).toStrictEqual({
      path: "locales/{lang}/{name}{ext}",
      asciiOnly: true,
      untranslated: "omit",
      encoding: "utf-8",
    });
  });

  it("rejects unknown output placeholders, absolute output paths and wrong output values", () => {
    expect(
      problemPaths({
        ...minimal,
        sources: [
          { format: "json", include: ["a"], output: { path: "out/{locale}/{name}.json" } },
          { format: "json", include: ["b"], output: { path: "C:/out/{name}.json", asciiOnly: "yes" } },
          { format: "json", include: ["c"], output: { path: "/out/{name}.json", untranslated: "drop" } },
        ],
      }),
    ).toEqual([
      "sources[0].output.path",
      "sources[1].output.path",
      "sources[1].output.asciiOnly",
      "sources[2].output.path",
      "sources[2].output.untranslated",
    ]);
  });

  it("reads an OpenAI-compatible provider, with the default address, key variable and answer format", () => {
    const config = parseConfig({ ...minimal, provider: { type: "openai-compatible", model: "gpt-5-mini" } });
    expect(config.provider).toStrictEqual({
      type: "openai-compatible",
      model: "gpt-5-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKeyEnv: "OPENAI_API_KEY",
      responseFormat: "json-schema",
    });

    const local = parseConfig({
      ...minimal,
      provider: {
        type: "openai-compatible",
        model: "qwen3-8b",
        baseUrl: "http://localhost:1234/v1",
        apiKeyEnv: "LM_STUDIO_KEY",
        responseFormat: "json-object",
      },
    });
    expect(local.provider).toMatchObject({ baseUrl: "http://localhost:1234/v1", responseFormat: "json-object" });
  });

  it("requires a model for an OpenAI-compatible provider: there is no sensible default", () => {
    expect(problemPaths({ ...minimal, provider: { type: "openai-compatible" } })).toEqual(["provider.model"]);
  });

  it("refuses an API key written in the configuration, and says where to put it", () => {
    const error = configErrorOf({
      ...minimal,
      provider: { type: "openai-compatible", model: "m", apiKeyEnv: "GROQ_API_KEY", apiKey: "secret" },
    });
    expect(error.problems).toEqual([{ path: "provider.apiKey", message: expect.stringContaining("GROQ_API_KEY") }]);
    expect(error.message).not.toContain("secret");
  });

  it("rejects a wrong address, key variable name or answer format", () => {
    expect(
      problemPaths({
        ...minimal,
        provider: {
          type: "openai-compatible",
          model: "m",
          baseUrl: "localhost:1234",
          apiKeyEnv: "my key",
          responseFormat: "xml",
        },
      }),
    ).toEqual(["provider.baseUrl", "provider.apiKeyEnv", "provider.responseFormat"]);
  });

  it("reads a Claude provider, with the Anthropic address and key variable by default", () => {
    const config = parseConfig({ ...minimal, provider: { type: "anthropic", model: "claude-haiku-5-5" } });
    expect(config.provider).toStrictEqual({
      type: "anthropic",
      model: "claude-haiku-5-5",
      baseUrl: "https://api.anthropic.com/v1",
      apiKeyEnv: "ANTHROPIC_API_KEY",
    });
    const priced = parseConfig({
      ...minimal,
      provider: { type: "anthropic", model: "m", pricing: { inputPerMillion: 1, outputPerMillion: 5 } },
    });
    expect(priced.provider).toMatchObject({ pricing: { inputPerMillion: 1, outputPerMillion: 5 } });
  });

  it("reads a Gemini provider, with the Google address and key variable by default", () => {
    const config = parseConfig({ ...minimal, provider: { type: "gemini", model: "gemini-2.5-flash" } });
    expect(config.provider).toStrictEqual({
      type: "gemini",
      model: "gemini-2.5-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKeyEnv: "GEMINI_API_KEY",
    });
    expect(problemPaths({ ...minimal, provider: { type: "gemini" } })).toEqual(["provider.model"]);
  });

  it("reads a DeepL provider: no model to choose, formality, address guessed from the key", () => {
    expect(parseConfig({ ...minimal, provider: { type: "deepl" } }).provider).toStrictEqual({
      type: "deepl",
      model: "deepl",
      apiKeyEnv: "DEEPL_API_KEY",
      formality: "default",
    });
    const custom = parseConfig({
      ...minimal,
      provider: {
        type: "deepl",
        model: "quality_optimized",
        formality: "prefer_less",
        baseUrl: "https://api.deepl.com",
        pricing: { perMillionCharacters: 20 },
      },
    });
    expect(custom.provider).toStrictEqual({
      type: "deepl",
      model: "quality_optimized",
      apiKeyEnv: "DEEPL_API_KEY",
      formality: "prefer_less",
      baseUrl: "https://api.deepl.com",
      pricing: { perMillionCharacters: 20 },
    });
  });

  it("rejects a wrong DeepL model, formality or price, and a key in the file", () => {
    expect(
      problemPaths({
        ...minimal,
        provider: {
          type: "deepl",
          model: "gpt-5",
          formality: "casual",
          pricing: { inputPerMillion: 1 },
          apiKey: "abc:fx",
        },
      }),
    ).toEqual(["provider.model", "provider.formality", "provider.apiKey", "provider.pricing.perMillionCharacters"]);
  });

  it("applies the same rules to every remote engine: model required, no key in the file", () => {
    expect(problemPaths({ ...minimal, provider: { type: "anthropic" } })).toEqual(["provider.model"]);
    const error = configErrorOf({ ...minimal, provider: { type: "anthropic", model: "m", apiKey: "sk-ant-secret" } });
    expect(error.problems).toEqual([
      { path: "provider.apiKey", message: expect.stringContaining("ANTHROPIC_API_KEY") },
    ]);
    expect(error.message).not.toContain("sk-ant-secret");
    expect(
      problemPaths({ ...minimal, provider: { type: "anthropic", model: "m", baseUrl: "api.anthropic.com" } }),
    ).toEqual(["provider.baseUrl"]);
  });

  it("keeps the prices per million tokens, used to estimate the cost of a run", () => {
    const provider = { type: "openai-compatible", model: "m" };
    const config = parseConfig({
      ...minimal,
      provider: { ...provider, pricing: { inputPerMillion: 0.4, outputPerMillion: 1.6 } },
    });
    expect(config.provider).toMatchObject({ pricing: { inputPerMillion: 0.4, outputPerMillion: 1.6 } });
    expect(parseConfig({ ...minimal, provider }).provider).not.toHaveProperty("pricing");
    expect(
      problemPaths({ ...minimal, provider: { ...provider, pricing: { inputPerMillion: -1, outputPerMillion: "1" } } }),
    ).toEqual(["provider.pricing.inputPerMillion", "provider.pricing.outputPerMillion"]);
    expect(problemPaths({ ...minimal, provider: { ...provider, pricing: 3 } })).toEqual(["provider.pricing"]);
  });

  it("rejects glossary entries that are not strings", () => {
    expect(problemPaths({ ...minimal, translation: { glossary: { NPC: 1, HP: "PV" } } })).toEqual([
      "translation.glossary.NPC",
    ]);
  });
});
