import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import { TranslationMemory } from "../../src/core/memory.js";
import { type PipelineOptions, type ProgressEvent, translateSegments } from "../../src/core/pipeline.js";
import { type Provider, ProviderUnavailableError } from "../../src/core/provider.js";
import type { Segment } from "../../src/core/types.js";
import { createMockProvider, type MockProvider } from "../../src/providers/mock/provider.js";

const config = parseConfig({
  sourceLanguage: "en",
  targetLanguage: "fr",
  sources: [{ format: "json", include: ["*.json"] }],
  translation: { batchSize: 2, instructions: "Casual tone.", glossary: { NPC: "PNJ" } },
});

const segment = (source: string, context?: string, group?: string, file = "ui.json"): Segment => ({
  source,
  priority: 0,
  locations: [{ file }],
  ...(context !== undefined ? { context } : {}),
  ...(group !== undefined ? { group } : {}),
});

const sources = ["One", "Two", "Three", "Four", "Five"];

/** Runs the pipeline with sensible test defaults; each test overrides what it checks. */
async function run(overrides: Partial<PipelineOptions> = {}) {
  const memory = overrides.memory ?? new TranslationMemory({ languages: config });
  const provider = overrides.provider ?? createMockProvider();
  let saves = 0;
  const events: ProgressEvent[] = [];
  const summary = await translateSegments({
    segments: sources.map((source) => segment(source)),
    memory,
    provider,
    config,
    save: async () => {
      saves++;
    },
    onProgress: (event) => events.push(event),
    ...overrides,
  });
  return { summary, memory, saves: () => saves, events };
}

const batchSizes = (provider: MockProvider) => provider.requests.map((request) => request.items.length);

describe("translateSegments", () => {
  it("translates in batches, validates, records the model and saves after every batch", async () => {
    const provider = createMockProvider();
    const { summary, memory, saves } = await run({ provider });
    expect(batchSizes(provider)).toEqual([2, 2, 1]);
    expect(saves()).toBe(3);
    expect(memory.get("Three")).toMatchObject({ target: "[fr] Three", status: "machine", model: "mock" });
    expect(summary).toStrictEqual({
      total: 5,
      alreadyDone: 0,
      translated: 5,
      reused: 0,
      failed: 0,
      interrupted: false,
    });
  });

  it("sends the languages, instructions, glossary and contexts to the provider", async () => {
    const provider = createMockProvider();
    await run({ provider, segments: [segment("Talk to the NPC", "quest log")] });
    expect(provider.requests[0]).toStrictEqual({
      sourceLanguage: "en",
      targetLanguage: "fr",
      instructions: "Casual tone.",
      glossary: { NPC: "PNJ" },
      items: [{ id: 0, source: "Talk to the NPC", context: "quest log" }],
    });
  });

  it("skips what the memory already has, and past failures unless asked to retry them", async () => {
    const memory = new TranslationMemory({ languages: config });
    memory.recordMachine("One", "Un", "m");
    memory.importTranslation("Two", "Deux");
    memory.recordFailure("Three", "empty");

    const first = await run({ memory });
    expect(first.summary).toMatchObject({ total: 2, alreadyDone: 3, translated: 2 });
    expect(memory.get("Two")?.target).toBe("Deux");

    const retry = await run({ memory: withFailure(), retryFailed: true });
    expect(retry.summary).toMatchObject({ alreadyDone: 0, translated: 5 });
  });

  it("stops after the given number of texts", async () => {
    const { summary, memory } = await run({ limit: 3 });
    expect(summary).toMatchObject({ total: 3, translated: 3 });
    expect(memory.get("Four")).toBeUndefined();
  });

  it("retries rejected translations alone, then logs the failure with its reason", async () => {
    const provider = createMockProvider({
      translate: (source) => (source === "Two" ? "Deux {town}" : `[fr] ${source}`),
    });
    const { summary, memory } = await run({ provider, segments: [segment("One"), segment("Two")] });
    expect(batchSizes(provider)).toEqual([2, 1, 1]);
    expect(summary).toMatchObject({ translated: 1, failed: 1 });
    expect(memory.getFailure("Two")).toMatchObject({ attempts: 1, model: "mock" });
    expect(memory.getFailure("Two")?.reason).toContain("{town}");
  });

  it("splits a batch into quarters, then single texts, when the answer is unreadable", async () => {
    const provider = createMockProvider({ failBatch: (request) => request.items.length > 1 });
    const segments = ["A", "B", "C", "D", "E", "F", "G", "H"].map((source) => segment(source));
    const eight = parseConfig({ ...rawConfig(), translation: { batchSize: 8 } });
    const { summary } = await run({ provider, segments, config: eight });
    expect(batchSizes(provider)).toEqual([8, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(summary).toMatchObject({ translated: 8, failed: 0 });
  });

  it("retries the texts the model left out of its answer", async () => {
    let calls = 0;
    const provider = createMockProvider({
      translate: (source) => (source === "One" && calls++ === 0 ? undefined : `[fr] ${source}`),
    });
    const { summary, memory } = await run({ provider, segments: [segment("One"), segment("Two")] });
    expect(summary).toMatchObject({ translated: 2, failed: 0 });
    expect(memory.get("One")?.target).toBe("[fr] One");
  });

  it("stops when the provider is unavailable, after saving the batches already done", async () => {
    let batch = 0;
    const flaky: Provider = {
      model: "flaky",
      translateBatch: async (request) => {
        if (batch++ > 0) throw new ProviderUnavailableError("Ollama stopped");
        return new Map(request.items.map((item) => [item.id, `[fr] ${item.source}`]));
      },
    };
    const memory = new TranslationMemory({ languages: config });
    let saves = 0;
    await expect(
      translateSegments({
        segments: sources.map((source) => segment(source)),
        memory,
        provider: flaky,
        config,
        save: async () => {
          saves++;
        },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
    expect(memory.entryList().map((entry) => entry.source)).toEqual(["One", "Two"]);
    expect(saves).toBe(2);
  });

  it("stops cleanly between batches when interrupted", async () => {
    const controller = new AbortController();
    const provider = createMockProvider();
    const { summary, saves } = await run({
      provider,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    expect(batchSizes(provider)).toEqual([2]);
    expect(saves()).toBe(1);
    expect(summary).toMatchObject({ translated: 2, interrupted: true });
  });

  it("reports progress with a time estimate based on characters", async () => {
    const times = [0, 1000, 3000];
    const one = parseConfig({ ...rawConfig(), translation: { batchSize: 1 } });
    const { events } = await run({
      config: one,
      segments: [segment("aaaa"), segment("bbbbbbbb")],
      now: () => times.shift() ?? 0,
    });
    expect(events).toStrictEqual([
      { done: 1, total: 2, translated: 1, failed: 0, elapsedMs: 1000, remainingMs: 2000 },
      { done: 2, total: 2, translated: 2, failed: 0, elapsedMs: 3000, remainingMs: 0 },
    ]);
  });
});

describe("translateSegments: conversations", () => {
  const sized = (batchSize: number, contextLines = 0) =>
    parseConfig({ ...rawConfig(), translation: { batchSize, contextLines } });

  it("keeps a conversation group in one batch whenever it fits", async () => {
    const provider = createMockProvider();
    const segments = [
      segment("A", undefined, "g1"),
      segment("B", undefined, "g2"),
      segment("C", undefined, "g2"),
      segment("D", undefined, "g2"),
      segment("E"),
    ];
    await run({ provider, segments, config: sized(3) });
    expect(batchSizes(provider)).toEqual([1, 3, 1]);
  });

  it("splits a group that is larger than a batch", async () => {
    const provider = createMockProvider();
    const segments = ["A", "B", "C", "D", "E"].map((source) => segment(source, undefined, "g"));
    await run({ provider, segments, config: sized(2) });
    expect(batchSizes(provider)).toEqual([2, 2, 1]);
  });

  it("sends the neighbouring lines of the same file, with their translation once known", async () => {
    const provider = createMockProvider();
    const segments = [
      segment("a"),
      segment("b"),
      segment("c"),
      segment("d"),
      segment("x", undefined, undefined, "other.json"),
    ];
    await run({ provider, segments, config: sized(2, 1) });
    expect(provider.requests.map((request) => request.surrounding)).toEqual([
      { before: [], after: [{ source: "c" }] },
      { before: [{ source: "b", translation: "[fr] b" }], after: [] },
      undefined,
    ]);
  });

  it("sends no surrounding lines when contextLines is 0", async () => {
    const provider = createMockProvider();
    await run({ provider, config: sized(2, 0) });
    expect(provider.requests.every((request) => request.surrounding === undefined)).toBe(true);
  });
});

describe("translateSegments: quality rules", () => {
  it("fixes the typography of the target language, unless disabled", async () => {
    const provider = createMockProvider({ translate: () => "Prêt?" });
    const fixed = await run({ provider, segments: [segment("Ready?")] });
    expect(fixed.memory.get("Ready?")?.target).toBe("Prêt\u{a0}?");

    const raw = parseConfig({ ...rawConfig(), translation: { typography: false } });
    const untouched = await run({ provider, segments: [segment("Ready?")], config: raw });
    expect(untouched.memory.get("Ready?")?.target).toBe("Prêt?");
  });

  it("rejects a translation that ignores the glossary, unless the check is disabled", async () => {
    const strict = await run({ segments: [segment("Talk to the NPC")] });
    expect(strict.memory.getFailure("Talk to the NPC")?.reason).toContain("glossary");

    const lenient = parseConfig({
      ...rawConfig(),
      translation: { glossary: { NPC: "PNJ" } },
      validation: { glossary: false },
    });
    const accepted = await run({ segments: [segment("Talk to the NPC")], config: lenient });
    expect(accepted.summary.translated).toBe(1);
  });

  it("masks placeholders for engines that ask for it, and puts them back", async () => {
    const provider = createMockProvider({ protectPlaceholders: true });
    const { memory } = await run({ provider, segments: [segment("Hello {name}")] });
    expect(provider.requests[0]?.items[0]?.source).toBe('Hello <x id="0"/>');
    expect(memory.get("Hello {name}")?.target).toBe("[fr] Hello {name}");

    const careless = createMockProvider({ protectPlaceholders: true, translate: () => "Bonjour" });
    const failed = await run({ provider: careless, segments: [segment("Hello {name}")] });
    expect(failed.memory.getFailure("Hello {name}")?.reason).toContain("protected tags missing");
  });
});

describe("translateSegments: reuse of changed texts", () => {
  function memoryWithOldTexts(): TranslationMemory {
    const memory = new TranslationMemory({ languages: config });
    memory.recordMachine("Quit game", "Quitter le jeu", "m");
    memory.recordMachine("Open the door", "Ouvrir la porte", "m");
    return memory;
  }
  const segments = [segment("Quit game."), segment("Open the doors")];

  it("copies the old translation when only the punctuation changed, and shows it to the model otherwise", async () => {
    const provider = createMockProvider();
    const { memory, summary } = await run({ provider, segments, memory: memoryWithOldTexts() });
    expect(memory.get("Quit game.")).toMatchObject({ target: "Quitter le jeu.", model: "reuse" });
    expect(provider.requests.flatMap((request) => request.items)).toEqual([
      { id: 0, source: "Open the doors", previous: { source: "Open the door", translation: "Ouvrir la porte" } },
    ]);
    expect(summary).toMatchObject({ total: 2, translated: 2, reused: 1 });
  });

  it("can be disabled", async () => {
    const provider = createMockProvider();
    const noReuse = parseConfig({ ...rawConfig(), translation: { reuse: false } });
    await run({ provider, segments, memory: memoryWithOldTexts(), config: noReuse });
    expect(provider.requests.flatMap((request) => request.items.map((item) => item.source))).toEqual([
      "Quit game.",
      "Open the doors",
    ]);
    expect(provider.requests.flatMap((request) => request.items).some((item) => item.previous)).toBe(false);
  });
});

function rawConfig() {
  return { sourceLanguage: "en", targetLanguage: "fr", sources: [{ format: "json", include: ["*.json"] }] };
}

function withFailure(): TranslationMemory {
  const memory = new TranslationMemory({ languages: config });
  memory.recordFailure("Three", "empty");
  return memory;
}
