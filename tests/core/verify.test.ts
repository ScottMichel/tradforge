import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import { TranslationMemory } from "../../src/core/memory.js";
import type { Provider, Review, ReviewRequest, TranslationRequest } from "../../src/core/provider.js";
import type { Segment } from "../../src/core/types.js";
import { type Judge, selectForCheck, verifyTranslations } from "../../src/core/verify.js";
import { createMockProvider } from "../../src/providers/mock/provider.js";

const config = parseConfig({
  sourceLanguage: "en",
  targetLanguage: "fr",
  sources: [{ format: "json", include: ["*.json"] }],
  translation: { batchSize: 10, instructions: "Players are addressed with tu.", glossary: { NPC: "PNJ" } },
});

const segment = (source: string): Segment => ({ source, priority: 0, locations: [{ file: "ui.json" }] });

/** A project: one suspicious translation (lost negation), one fine, one reviewed by a human. */
function project() {
  const memory = new TranslationMemory({ languages: config });
  memory.recordMachine("Don't open the door.", "Ouvre la porte.", "mistral-small");
  memory.recordMachine("Talk to the NPC near the gate.", "Parle au PNJ près de la porte.", "mistral-small");
  memory.importTranslation("Wait 3 days.", "Attends 30 jours.");
  const segments = ["Don't open the door.", "Talk to the NPC near the gate.", "Wait 3 days.", "Not translated"].map(
    segment,
  );
  return { memory, segments };
}

/** Translates French back to English with a small dictionary of whole sentences. */
const backTranslations: Record<string, string> = {
  "Ouvre la porte.": "Open the door.",
  "Parle au PNJ près de la porte.": "Talk to the NPC by the gate.",
};
const backTranslator = () =>
  createMockProvider({ model: "back", translate: (source) => backTranslations[source] ?? `?? ${source}` });

/** Says "different" when a negation disappeared, "same" otherwise, and records what it was asked. */
function fakeJudge() {
  const requests: ReviewRequest[] = [];
  const judge: Judge = {
    model: "judge",
    review: async (request) => {
      requests.push(request);
      const negative = /n't|not|never/i;
      return new Map(
        request.items.map((item): [number, Review] => [
          item.id,
          negative.test(item.original) && !negative.test(item.backTranslation)
            ? { verdict: "different", note: "The negation is lost." }
            : { verdict: "same", note: "ok" },
        ]),
      );
    },
  };
  return { judge, requests };
}

describe("selectForCheck", () => {
  it("picks the machine translations that look suspicious and were never checked", () => {
    const { memory, segments } = project();
    expect(selectForCheck(segments, memory, config).map((c) => [c.source, c.reasons])).toEqual([
      ["Don't open the door.", ["negation-lost"]],
    ]);
  });

  it("picks every machine translation with all, but never a human one", () => {
    const { memory, segments } = project();
    expect(selectForCheck(segments, memory, config, { all: true }).map((c) => c.source)).toEqual([
      "Don't open the door.",
      "Talk to the NPC near the gate.",
    ]);
  });

  it("skips what was already checked, and follows the limit", () => {
    const { memory, segments } = project();
    const check = { verdict: "same" as const, note: "ok", backTranslation: "x", model: "judge" };
    memory.recordCheck("Don't open the door.", "Ouvre la porte.", check);
    expect(selectForCheck(segments, memory, config, { all: true }).map((c) => c.source)).toEqual([
      "Talk to the NPC near the gate.",
    ]);
    expect(selectForCheck(project().segments, project().memory, config, { all: true, limit: 1 })).toHaveLength(1);
  });
});

describe("verifyTranslations", () => {
  it("translates back, has the judge compare in the source language, and keeps the verdicts", async () => {
    const { memory, segments } = project();
    const translator = backTranslator();
    const { judge, requests } = fakeJudge();
    let saves = 0;
    const summary = await verifyTranslations({
      candidates: selectForCheck(segments, memory, config, { all: true }),
      memory,
      config,
      translator,
      judge,
      save: async () => {
        saves++;
      },
    });

    expect(summary).toEqual({ checked: 2, same: 1, nuance: 0, different: 1, failed: 0, interrupted: false });
    expect(memory.get("Don't open the door.")?.check).toMatchObject({
      verdict: "different",
      note: "The negation is lost.",
      backTranslation: "Open the door.",
      model: "judge",
    });
    expect(memory.get("Talk to the NPC near the gate.")?.check?.verdict).toBe("same");
    expect(requests[0]?.language).toBe("en");
    expect(requests[0]?.items.map((item) => item.original)).toEqual([
      "Don't open the door.",
      "Talk to the NPC near the gate.",
    ]);
    expect(saves).toBeGreaterThan(0);
  });

  it("translates back without the glossary, typography or instructions, which are written for the other way", async () => {
    const { memory, segments } = project();
    const translator = backTranslator();
    await verifyTranslations({
      candidates: selectForCheck(segments, memory, config, { all: true }),
      memory,
      config,
      translator,
      judge: fakeJudge().judge,
      save: async () => {},
    });
    const [request] = translator.requests as TranslationRequest[];
    expect(request).toMatchObject({ sourceLanguage: "fr", targetLanguage: "en" });
    expect(request).not.toHaveProperty("instructions");
    expect(request?.glossary).toEqual({});
  });

  it("counts a text it could not translate back as failed, and records nothing for it", async () => {
    const { memory, segments } = project();
    const broken: Provider = createMockProvider({ model: "broken", translate: () => undefined });
    const summary = await verifyTranslations({
      candidates: selectForCheck(segments, memory, config),
      memory,
      config,
      translator: broken,
      judge: fakeJudge().judge,
      save: async () => {},
    });
    expect(summary).toMatchObject({ checked: 0, failed: 1 });
    expect(memory.get("Don't open the door.")).not.toHaveProperty("check");
  });

  it("stops cleanly when interrupted while the judge works", async () => {
    const { memory, segments } = project();
    const controller = new AbortController();
    const judge: Judge = {
      model: "judge",
      review: async () => {
        controller.abort(new Error("Ctrl+C"));
        throw new Error("aborted");
      },
    };
    const summary = await verifyTranslations({
      candidates: selectForCheck(segments, memory, config, { all: true }),
      memory,
      config,
      translator: backTranslator(),
      judge,
      save: async () => {},
      signal: controller.signal,
    });
    expect(summary).toMatchObject({ checked: 0, interrupted: true });
  });

  it("does nothing when there is nothing to check", async () => {
    const { memory } = project();
    const { judge, requests } = fakeJudge();
    const summary = await verifyTranslations({
      candidates: [],
      memory,
      config,
      translator: backTranslator(),
      judge,
      save: async () => {},
    });
    expect(summary).toEqual({ checked: 0, same: 0, nuance: 0, different: 0, failed: 0, interrupted: false });
    expect(requests).toEqual([]);
  });
});
