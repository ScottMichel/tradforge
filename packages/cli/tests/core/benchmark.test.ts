import { describe, expect, it } from "vitest";
import { benchmarkEngines } from "../../src/core/benchmark.js";
import { parseConfig } from "../../src/core/config.js";
import { type Provider, ProviderUnavailableError, RateLimitError } from "../../src/core/provider.js";
import type { Segment } from "../../src/core/types.js";
import { createMockProvider } from "../../src/providers/mock/provider.js";

const config = parseConfig({
  sourceLanguage: "en",
  targetLanguage: "fr",
  sources: [{ format: "json", include: ["*.json"] }],
  translation: { batchSize: 10 },
});

const segments: Segment[] = ["Play", "Quit", "Hello {name}"].map((source) => ({
  source,
  priority: 0,
  locations: [{ file: "ui.json" }],
}));

/** A clock that moves forward by the given steps, one per call. */
function clock(...times: number[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)] ?? 0;
}

describe("benchmarkEngines", () => {
  it("runs the sample through each engine and reports translations, failures and time", async () => {
    const good = createMockProvider({ model: "good" });
    const inventing = createMockProvider({
      model: "inventing",
      translate: (source) => (source === "Play" ? "Jouer {town}" : `[fr] ${source}`),
    });
    const results = await benchmarkEngines({
      segments,
      config,
      engines: [
        { label: "first", provider: good },
        { label: "second", provider: inventing },
      ],
      now: clock(0, 1500, 2000, 2800),
    });

    expect(results.map((r) => [r.label, r.model, r.translated, r.failed, r.elapsedMs])).toEqual([
      ["first", "good", 3, 0, 1500],
      ["second", "inventing", 2, 1, 800],
    ]);
    expect(results[0]?.targets.get("Hello {name}")).toBe("[fr] Hello {name}");
    expect(results[1]?.targets.has("Play")).toBe(false);
    expect(results[1]?.failures.get("Play")).toMatch(/placeholder/);
  });

  it("gives every engine a fresh memory, so that none of them reuses the work of another", async () => {
    const first = createMockProvider();
    const second = createMockProvider();
    await benchmarkEngines({
      segments,
      config,
      engines: [
        { label: "a", provider: first },
        { label: "b", provider: second },
      ],
    });
    expect(second.requests.flatMap((request) => request.items.map((item) => item.source))).toEqual([
      "Play",
      "Quit",
      "Hello {name}",
    ]);
  });

  it("reports an engine that cannot be used, and goes on with the others", async () => {
    const down: Provider = {
      model: "down",
      translateBatch: async () => {
        throw new ProviderUnavailableError("no API key for Gemini: set GEMINI_API_KEY");
      },
    };
    const results = await benchmarkEngines({
      segments,
      config,
      engines: [
        { label: "gemini", provider: down },
        { label: "mock", provider: createMockProvider() },
      ],
    });
    expect(results[0]).toMatchObject({
      label: "gemini",
      translated: 0,
      error: expect.stringContaining("GEMINI_API_KEY"),
    });
    expect(results[1]).toMatchObject({ label: "mock", translated: 3 });
    expect(results[1]).not.toHaveProperty("error");
  });

  it("says which engine waits on a rate limit, so that a slow comparison is never silent", async () => {
    let refused = false;
    const busy: Provider = {
      model: "busy",
      translateBatch: async (request) => {
        if (!refused) {
          refused = true;
          throw new RateLimitError("overloaded", 0);
        }
        return new Map(request.items.map((item) => [item.id, `[fr] ${item.source}`]));
      },
    };
    const waits: string[] = [];
    await benchmarkEngines({
      segments,
      config,
      engines: [{ label: "gemini", provider: busy }],
      onRateLimit: (label, event) => waits.push(`${label} ${event.waitMs}`),
    });
    expect(waits).toEqual(["gemini 0"]);
  });

  it("stops at once when interrupted, keeping the engines already done", async () => {
    const controller = new AbortController();
    const results = await benchmarkEngines({
      segments,
      config,
      engines: [
        { label: "a", provider: createMockProvider() },
        { label: "b", provider: createMockProvider() },
      ],
      signal: controller.signal,
      onEngineDone: () => controller.abort(),
    });
    expect(results.map((r) => r.label)).toEqual(["a"]);
  });
});
