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
          output: { path: "{dir}/{name}.{lang}{ext}", asciiOnly: false, untranslated: "keep-source" },
        },
      ],
      provider: { type: "ollama", model: "mistral-small", host: "http://localhost:11434" },
      translation: { batchSize: 20, glossary: {} },
      validation: { placeholders: ["braces", "printf", "markup"] },
    });
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
      instructions: "Casual tone.",
      glossary: { NPC: "PNJ" },
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
        provider: { type: "deepl" },
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
        output: DEFAULT_OUTPUT,
      },
      { format: "json", include: ["ui/*.json"], priority: 5, output: DEFAULT_OUTPUT },
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
    });
  });

  it("rejects unknown output placeholders, absolute output paths and wrong output values", () => {
    expect(
      problemPaths({
        ...minimal,
        sources: [
          { format: "json", include: ["a"], output: { path: "out/{language}/{name}.json" } },
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

  it("rejects glossary entries that are not strings", () => {
    expect(problemPaths({ ...minimal, translation: { glossary: { NPC: 1, HP: "PV" } } })).toEqual([
      "translation.glossary.NPC",
    ]);
  });
});
