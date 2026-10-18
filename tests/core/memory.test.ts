import { describe, expect, it } from "vitest";
import { TranslationMemory } from "../../src/core/memory.js";

const languages = { sourceLanguage: "en", targetLanguage: "fr" };

/** A clock that moves one second forward at each call, so dates are predictable. */
function fakeClock(): () => Date {
  let seconds = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds++));
}

const newMemory = () => new TranslationMemory({ languages, clock: fakeClock() });

describe("TranslationMemory", () => {
  it("records a machine translation with its model and date", () => {
    const memory = newMemory();
    expect(memory.recordMachine("Hello", "Bonjour", "mistral-small")).toBe("saved");
    expect(memory.get("Hello")).toStrictEqual({
      source: "Hello",
      target: "Bonjour",
      status: "machine",
      model: "mistral-small",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("lets a new machine translation replace an older one", () => {
    const memory = newMemory();
    memory.recordMachine("Hello", "Bonjour", "model-a");
    memory.recordMachine("Hello", "Salut", "model-b");
    expect(memory.get("Hello")?.target).toBe("Salut");
  });

  it("never lets the model overwrite a reviewed translation", () => {
    const memory = newMemory();
    memory.importTranslation("Hello", "Bonjour à vous");
    expect(memory.recordMachine("Hello", "Salut", "mistral-small")).toBe("kept-reviewed");
    expect(memory.get("Hello")).toMatchObject({ target: "Bonjour à vous", status: "reviewed" });
  });

  it("logs failures, counts attempts, and forgets them once translated", () => {
    const memory = newMemory();
    memory.recordFailure("Go to town", "added by the translation: {town}", "mistral-small");
    memory.recordFailure("Go to town", "missing from the translation: %d");
    expect(memory.failureList()).toStrictEqual([
      {
        source: "Go to town",
        reason: "missing from the translation: %d",
        attempts: 2,
        updatedAt: "2026-01-01T00:00:01.000Z",
      },
    ]);
    memory.recordMachine("Go to town", "Allez en ville", "mistral-small");
    expect(memory.failureList()).toEqual([]);
  });

  it("imports manual translations as reviewed, and can keep the existing ones", () => {
    const memory = newMemory();
    memory.recordMachine("Hello", "Bonjour", "mistral-small");
    expect(memory.importTranslation("Hello", "Salut", { keep: true })).toBe("skipped");
    expect(memory.get("Hello")?.target).toBe("Bonjour");
    expect(memory.importTranslation("Hello", "Salut")).toBe("updated");
    expect(memory.importTranslation("Bye", "Au revoir")).toBe("added");
    expect(memory.get("Hello")).toMatchObject({ target: "Salut", status: "reviewed" });
    expect(memory.get("Hello")).not.toHaveProperty("model");
  });

  it("lists entries sorted by source, whatever the insertion order", () => {
    const memory = newMemory();
    memory.recordMachine("b", "B", "m");
    memory.recordMachine("a", "A", "m");
    memory.recordMachine("C", "C", "m");
    expect(memory.entryList().map((entry) => entry.source)).toEqual(["C", "a", "b"]);
  });

  it("computes statistics against the current sources of the project", () => {
    const memory = newMemory();
    memory.recordMachine("Hello", "Bonjour", "m");
    memory.importTranslation("Bye", "Au revoir");
    memory.recordFailure("Go to town", "added by the translation: {town}");
    memory.recordMachine("Removed text", "Texte retiré", "m");
    const current = ["Hello", "Bye", "Go to town", "New text", "Hello"];
    expect(memory.stats(current)).toStrictEqual({
      total: 4,
      translated: 2,
      reviewed: 1,
      failed: 1,
      pending: 1,
      stale: 1,
    });
    expect(memory.staleSources(current)).toEqual(["Removed text"]);
  });

  it("starts from existing entries and failures", () => {
    const entry = { source: "Hi", target: "Salut", status: "reviewed", updatedAt: "2025-12-31T00:00:00.000Z" } as const;
    const failure = { source: "Yo", reason: "empty", attempts: 1, updatedAt: "2025-12-31T00:00:00.000Z" };
    const memory = new TranslationMemory({ languages, entries: [entry], failures: [failure] });
    expect(memory.get("Hi")).toStrictEqual(entry);
    expect(memory.failureList()).toStrictEqual([failure]);
  });
});
