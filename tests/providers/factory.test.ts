import { describe, expect, it } from "vitest";
import { createProvider } from "../../src/providers/factory.js";

describe("createProvider", () => {
  it("creates the provider described by the configuration", () => {
    const provider = createProvider({ type: "ollama", model: "mistral-small", host: "http://localhost:11434" });
    expect(provider.model).toBe("mistral-small");
  });
});
