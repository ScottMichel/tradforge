import { describe, expect, it } from "vitest";
import { BatchError, type TranslationRequest } from "../../../src/core/provider.js";
import { createMockProvider } from "../../../src/providers/mock/provider.js";

const request: TranslationRequest = {
  sourceLanguage: "en",
  targetLanguage: "fr",
  items: [
    { id: 0, source: "Hello" },
    { id: 1, source: "Go to town" },
  ],
};

describe("Mock provider", () => {
  it("translates deterministically and records every request", async () => {
    const provider = createMockProvider();
    expect(await provider.translateBatch(request)).toEqual(
      new Map([
        [0, "[fr] Hello"],
        [1, "[fr] Go to town"],
      ]),
    );
    expect(provider.model).toBe("mock");
    expect(provider.requests).toEqual([request]);
  });

  it("can leave items out or answer with invented placeholders", async () => {
    const provider = createMockProvider({
      translate: (source) => (source === "Hello" ? undefined : "Allez en {town}"),
    });
    expect(await provider.translateBatch(request)).toEqual(new Map([[1, "Allez en {town}"]]));
  });

  it("can fail a batch the way an unreadable answer does", async () => {
    const provider = createMockProvider({ failBatch: (batch) => batch.items.length > 1 });
    await expect(provider.translateBatch(request)).rejects.toThrow(BatchError);
    const single = { ...request, items: request.items.slice(0, 1) };
    expect(await provider.translateBatch(single)).toEqual(new Map([[0, "[fr] Hello"]]));
  });
});
