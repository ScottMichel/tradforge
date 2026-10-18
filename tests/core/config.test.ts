import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../../src/core/config.js";

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
      sources: [{ format: "json", include: ["locales/en/*.json"] }],
      provider: { type: "ollama", model: "mistral-small", host: "http://localhost:11434" },
      translation: { batchSize: 20, glossary: {} },
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

  it("rejects glossary entries that are not strings", () => {
    expect(problemPaths({ ...minimal, translation: { glossary: { NPC: 1, HP: "PV" } } })).toEqual([
      "translation.glossary.NPC",
    ]);
  });
});
