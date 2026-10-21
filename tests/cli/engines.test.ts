import { describe, expect, it } from "vitest";
import { UsageError } from "../../src/cli/command.js";
import { parseEngines } from "../../src/cli/engines.js";
import type { ProviderConfig } from "../../src/core/config.js";

const project: ProviderConfig = {
  type: "openai-compatible",
  model: "gpt-test",
  baseUrl: "https://api.mistral.ai/v1",
  apiKeyEnv: "MISTRAL_API_KEY",
  responseFormat: "json-object",
  pricing: { inputPerMillion: 0.1, outputPerMillion: 0.3 },
};

describe("parseEngines", () => {
  it("reads type:model specs, with each engine's defaults", () => {
    expect(parseEngines("ollama, gemini:gemini-flash-latest ,deepl", project)).toEqual([
      {
        label: "ollama:mistral-small",
        config: { type: "ollama", model: "mistral-small", host: "http://localhost:11434" },
      },
      {
        label: "gemini:gemini-flash-latest",
        config: expect.objectContaining({ type: "gemini", apiKeyEnv: "GEMINI_API_KEY" }),
      },
      { label: "deepl", config: expect.objectContaining({ type: "deepl", model: "deepl" }) },
    ]);
  });

  it("cuts at the first colon only, since Ollama model names have one", () => {
    expect(parseEngines("ollama:qwen3:8b", project)[0]?.config).toMatchObject({ type: "ollama", model: "qwen3:8b" });
  });

  it("keeps the project settings for an engine of the same type: address, key variable, prices", () => {
    expect(parseEngines("openai-compatible:mistral-large-latest", project)[0]).toEqual({
      label: "openai-compatible:mistral-large-latest",
      config: { ...project, model: "mistral-large-latest" },
    });
  });

  it.each([
    ["", /--engines/],
    ["babelfish", /babelfish.*provider\.type/],
    ["gemini", /gemini.*provider\.model.*required/],
    ["ollama:a,ollama:a", /twice/],
  ])("explains a wrong list: %j", (list, message) => {
    expect(() => parseEngines(list, project)).toThrow(UsageError);
    expect(() => parseEngines(list, project)).toThrow(message);
  });
});
