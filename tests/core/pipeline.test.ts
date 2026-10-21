import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import { TranslationMemory } from "../../src/core/memory.js";
import { type PipelineOptions, type ProgressEvent, planRequests, translateSegments } from "../../src/core/pipeline.js";
import { type Provider, ProviderUnavailableError, RateLimitError, TimeoutError } from "../../src/core/provider.js";
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

  it("checks the placeholders of the formats the project uses", async () => {
    const provider = createMockProvider({ translate: () => "Le forgeron arrive." });
    const json = await run({ provider, segments: [segment("The smith of $PROVINCE$ arrives.")] });
    expect(json.summary.translated).toBe(1);

    const paradox = parseConfig({ ...rawConfig(), sources: [{ format: "paradox-yml", include: ["l/*.yml"] }] });
    const strict = await run({ provider, segments: [segment("The smith of $PROVINCE$ arrives.")], config: paradox });
    expect(strict.memory.getFailure("The smith of $PROVINCE$ arrives.")?.reason).toContain("$PROVINCE$");
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

describe("translateSegments with several batches at once", () => {
  const parallel = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "json", include: ["*.json"] }],
    translation: { batchSize: 1, concurrency: 3 },
  });
  const many = ["One", "Two", "Three", "Four", "Five", "Six", "Seven"];

  /** Answers after a short wait, and records how many requests were open at the same time. */
  function slowProvider(fail?: (source: string) => Error | undefined) {
    const stats = { open: 0, maxOpen: 0, sent: [] as string[] };
    const provider: Provider = {
      model: "slow",
      translateBatch: async (request, signal) => {
        stats.open++;
        stats.maxOpen = Math.max(stats.maxOpen, stats.open);
        stats.sent.push(...request.items.map((item) => item.source));
        try {
          // Different waits, so that batches finish in another order than they started.
          await new Promise((resolve) => setTimeout(resolve, 2 + (request.items[0]?.source.length ?? 0)));
          signal?.throwIfAborted();
          const error = request.items.map((item) => fail?.(item.source)).find((e) => e !== undefined);
          if (error !== undefined) throw error;
          return new Map(request.items.map((item) => [item.id, `[fr] ${item.source}`]));
        } finally {
          stats.open--;
        }
      },
    };
    return { provider, stats };
  }

  const translate = (overrides: Partial<PipelineOptions>) =>
    translateSegments({
      segments: many.map((source) => segment(source)),
      memory: new TranslationMemory({ languages: parallel }),
      provider: createMockProvider(),
      config: parallel,
      save: async () => {},
      ...overrides,
    });

  it("keeps up to concurrency batches in flight, never more, and translates everything", async () => {
    const { provider, stats } = slowProvider();
    const memory = new TranslationMemory({ languages: parallel });
    const summary = await translate({ provider, memory });
    expect(stats.maxOpen).toBe(3);
    expect(summary).toMatchObject({ total: 7, translated: 7, failed: 0, interrupted: false });
    expect(memory.entryList().map((entry) => entry.target)).toEqual(
      expect.arrayContaining(many.map((source) => `[fr] ${source}`)),
    );
  });

  it("sends one batch at a time by default", async () => {
    const { provider, stats } = slowProvider();
    await translate({ provider, config: { ...parallel, translation: { ...parallel.translation, concurrency: 1 } } });
    expect(stats.maxOpen).toBe(1);
    expect(stats.sent).toEqual(many);
  });

  it("starts the batches in file order", async () => {
    const { provider, stats } = slowProvider();
    await translate({ provider });
    expect(stats.sent).toEqual(many);
  });

  it("never runs two saves at the same time, and saves after every batch", async () => {
    const { provider } = slowProvider();
    const saves = { count: 0, open: 0, maxOpen: 0 };
    await translate({
      provider,
      save: async () => {
        saves.open++;
        saves.maxOpen = Math.max(saves.maxOpen, saves.open);
        await new Promise((resolve) => setTimeout(resolve, 3));
        saves.open--;
        saves.count++;
      },
    });
    expect(saves).toMatchObject({ count: 7, maxOpen: 1 });
  });

  it("reports progress that only goes up", async () => {
    const { provider } = slowProvider();
    const events: ProgressEvent[] = [];
    await translate({ provider, onProgress: (event) => events.push(event) });
    expect(events.map((event) => event.done)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stops every batch when interrupted, keeps what was done, and resumes without redoing it", async () => {
    const controller = new AbortController();
    const memory = new TranslationMemory({ languages: parallel });
    const first = slowProvider();
    const summary = await translate({
      provider: first.provider,
      memory,
      signal: controller.signal,
      onProgress: (event) => {
        if (event.done === 2) controller.abort(new Error("Ctrl+C"));
      },
    });
    expect(summary.interrupted).toBe(true);
    expect(summary.translated).toBeLessThan(7);
    expect(summary.failed).toBe(0); // an interrupted batch is not a failure: it is translated next time

    const second = slowProvider();
    const rest = await translate({ provider: second.provider, memory });
    expect(rest).toMatchObject({ alreadyDone: summary.translated, translated: 7 - summary.translated });
    expect(new Set([...first.stats.sent, ...second.stats.sent])).toEqual(new Set(many));
    expect(second.stats.sent.filter((source) => memory.get(source)?.target === undefined)).toEqual([]);
  });

  it("stops on a fatal error once the batches in flight are done and saved", async () => {
    const { provider, stats } = slowProvider((source) =>
      source === "Two" ? new ProviderUnavailableError("the server stopped") : undefined,
    );
    const memory = new TranslationMemory({ languages: parallel });
    let saves = 0;
    await expect(
      translate({
        provider,
        memory,
        save: async () => {
          saves++;
        },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
    // "One" and "Three" were sent with "Two": they finish and are kept. Nothing new starts after the error.
    expect(memory.get("One")?.target).toBe("[fr] One");
    expect(memory.get("Three")?.target).toBe("[fr] Three");
    expect(stats.sent.length).toBeLessThan(7);
    expect(saves).toBe(stats.sent.length);
  });
});

describe("translateSegments under a rate limit", () => {
  const limited = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "json", include: ["*.json"] }],
    translation: { batchSize: 2 },
  });

  /** Refuses the first `refusals` requests with a rate limit, then translates. */
  function busyProvider(refusals: number, retryAfterMs?: number) {
    const sizes: number[] = [];
    const provider: Provider = {
      model: "busy",
      translateBatch: async (request) => {
        sizes.push(request.items.length);
        if (sizes.length <= refusals) throw new RateLimitError("rate limit reached", retryAfterMs);
        return new Map(request.items.map((item) => [item.id, `[fr] ${item.source}`]));
      },
    };
    return { provider, sizes };
  }

  /** Records the waits instead of waiting. */
  function fakeSleep() {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    return { sleep, waits };
  }

  const translate = (overrides: Partial<PipelineOptions>) =>
    translateSegments({
      segments: ["One", "Two", "Three"].map((source) => segment(source)),
      memory: new TranslationMemory({ languages: limited }),
      provider: createMockProvider(),
      config: limited,
      save: async () => {},
      ...overrides,
    });

  it("waits the delay the server asks for, then sends the same batch again, whole", async () => {
    const { provider, sizes } = busyProvider(2, 20_000);
    const { sleep, waits } = fakeSleep();
    const summary = await translate({ provider, sleep });
    expect(waits).toEqual([20_000, 20_000]);
    expect(sizes).toEqual([2, 2, 2, 1]); // not split into smaller batches: the batch was not the problem
    expect(summary).toMatchObject({ translated: 3, failed: 0 });
  });

  it("waits longer and longer when the server does not say how long", async () => {
    const { provider } = busyProvider(4);
    const { sleep, waits } = fakeSleep();
    await translate({ provider, sleep });
    expect(waits).toEqual([1000, 2000, 4000, 8000]);
  });

  it("tells the caller how long it waits", async () => {
    const { provider } = busyProvider(1, 5000);
    const { sleep } = fakeSleep();
    const waits: number[] = [];
    await translate({ provider, sleep, onRateLimit: (event) => waits.push(event.waitMs) });
    expect(waits).toEqual([5000]);
  });

  it("stops with advice when the limit is still reached after many waits", async () => {
    const { provider } = busyProvider(100);
    const { sleep, waits } = fakeSleep();
    await expect(translate({ provider, sleep })).rejects.toThrow(
      expect.objectContaining({ name: "ProviderUnavailableError", message: expect.stringMatching(/concurrency/) }),
    );
    expect(waits).toHaveLength(6);
  });

  it("pauses every batch in flight, not only the one that was refused", async () => {
    let paused = false;
    let sentDuringPause = 0;
    let refused = false;
    const provider: Provider = {
      model: "shared-limit",
      translateBatch: async (request) => {
        if (paused) sentDuringPause++;
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (!refused) {
          refused = true;
          throw new RateLimitError("rate limit reached", 50);
        }
        return new Map(request.items.map((item) => [item.id, `[fr] ${item.source}`]));
      },
    };
    const sleep = async (ms: number) => {
      paused = true;
      await new Promise((resolve) => setTimeout(resolve, ms));
      paused = false;
    };
    const summary = await translateSegments({
      segments: ["A1", "B2", "C3", "D4", "E5", "F6", "G7", "H8"].map((source) => segment(source)),
      memory: new TranslationMemory({ languages: limited }),
      provider,
      config: { ...limited, translation: { ...limited.translation, batchSize: 1, concurrency: 3 } },
      save: async () => {},
      sleep,
    });
    expect(summary).toMatchObject({ translated: 8, failed: 0 });
    expect(sentDuringPause).toBe(0);
  });

  it("can be interrupted while it waits", async () => {
    const controller = new AbortController();
    const { provider } = busyProvider(1, 60_000);
    setTimeout(() => controller.abort(new Error("Ctrl+C")), 10);
    const started = Date.now();
    const summary = await translate({ provider, signal: controller.signal }); // the real sleep, not a fake one
    expect(summary).toMatchObject({ interrupted: true, translated: 0, failed: 0 });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("planRequests", () => {
  const planned = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "json", include: ["*.json"] }],
    translation: { batchSize: 2, instructions: "Casual tone.", glossary: { NPC: "PNJ" }, contextLines: 0 },
  });
  const texts = [
    segment("Hello", "greeting"),
    segment("Talk to the NPC"),
    segment("Line 1", undefined, "dialog"),
    segment("Line 2", undefined, "dialog"),
    segment("Bye"),
  ];

  it("plans exactly the requests a run sends when every answer is good", async () => {
    const memory = new TranslationMemory({ languages: planned });
    memory.recordMachine("Bye", "Salut", "m");
    const plan = planRequests(texts, memory, planned);

    const provider = createMockProvider({ translate: (source) => `[fr] ${source.replace("NPC", "PNJ")}` });
    await translateSegments({ segments: texts, memory, provider, config: planned, save: async () => {} });
    expect(plan).toStrictEqual(provider.requests);
    expect(plan.map((request) => request.items.length)).toEqual([2, 2]);
  });

  it("sends the neighbours already translated as context", () => {
    const withContext = { ...planned, translation: { ...planned.translation, contextLines: 1 } };
    const memory = new TranslationMemory({ languages: planned });
    memory.recordMachine("Talk to the NPC", "Parle au PNJ", "m");
    const [request] = planRequests(texts, memory, withContext);
    expect(request?.items.map((item) => item.source)).toEqual(["Hello"]); // the dialog group does not fit with it
    expect(request?.surrounding).toEqual({
      before: [],
      after: [{ source: "Talk to the NPC", translation: "Parle au PNJ" }],
    });
  });

  it("follows the limit and the failures to retry, like a run", () => {
    const memory = new TranslationMemory({ languages: planned });
    memory.recordFailure("Hello", "empty");
    const sources = (options: { retryFailed?: boolean; limit?: number }) =>
      planRequests(texts, memory, planned, options).flatMap((request) => request.items.map((item) => item.source));
    expect(sources({})).toEqual(["Talk to the NPC", "Line 1", "Line 2", "Bye"]);
    expect(sources({ retryFailed: true, limit: 2 })).toEqual(["Hello", "Talk to the NPC"]);
  });
});

describe("translateSegments with an engine that stops answering", () => {
  const quiet = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "json", include: ["*.json"] }],
    translation: { batchSize: 4 },
  });
  const texts = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"].map((source) => segment(source));

  it("stops after a few silences in a row, rather than trying ever smaller batches", async () => {
    let requests = 0;
    const silent: Provider = {
      model: "silent",
      translateBatch: async () => {
        requests++;
        throw new TimeoutError("the server did not answer within 300 s");
      },
    };
    const run = translateSegments({
      segments: texts,
      memory: new TranslationMemory({ languages: quiet }),
      provider: silent,
      config: quiet,
      save: async () => {},
    });
    await expect(run).rejects.toThrow(ProviderUnavailableError);
    await expect(run).rejects.toThrow(/did not answer 3 times in a row/);
    expect(requests).toBe(3);
  });

  it("goes on when a smaller batch gets an answer: only silences in a row count", async () => {
    const slowOnBigBatches: Provider = {
      model: "slow",
      translateBatch: async (request) => {
        if (request.items.length > 1) throw new TimeoutError("too slow for this batch");
        return new Map(request.items.map((item) => [item.id, `[fr] ${item.source}`]));
      },
    };
    const summary = await translateSegments({
      segments: texts,
      memory: new TranslationMemory({ languages: quiet }),
      provider: slowOnBigBatches,
      config: quiet,
      save: async () => {},
    });
    expect(summary).toMatchObject({ translated: 8, failed: 0 });
  });
});
