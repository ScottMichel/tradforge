import { describe, expect, it } from "vitest";
import { TranslationMemory } from "../../src/core/memory.js";
import { CsvError, formatCsv, parseCsv } from "../../src/storage/csv.js";
import { exportReviewCsv, importReviewCsv } from "../../src/storage/review.js";

const languages = { sourceLanguage: "en", targetLanguage: "fr" };

function sampleMemory(): TranslationMemory {
  const memory = new TranslationMemory({ languages });
  memory.recordMachine("Hello", "Bonjour", "mistral-small");
  memory.importTranslation("Bye", "Au revoir");
  memory.recordMachine("Removed text", "Texte retiré", "mistral-small");
  memory.recordFailure("Go to town", "added by the translation: {town}");
  return memory;
}

describe("exportReviewCsv", () => {
  it("lists every translation and every untranslated source, sorted, with its status", () => {
    const current = ["Hello", "Bye", "Go to town", "New text"];
    expect(parseCsv(exportReviewCsv(sampleMemory(), current))).toEqual([
      ["source", "target", "status"],
      ["Bye", "Au revoir", "reviewed"],
      ["Go to town", "", "failed"],
      ["Hello", "Bonjour", "machine"],
      ["New text", "", "pending"],
      ["Removed text", "Texte retiré", "stale"],
    ]);
  });
});

describe("importReviewCsv", () => {
  const csv = (...rows: string[][]) => formatCsv([["source", "target", "status"], ...rows]);

  it("imports corrected and new translations as reviewed", () => {
    const memory = sampleMemory();
    const result = importReviewCsv(
      memory,
      csv(["Hello", "Salut", "machine"], ["New text", "Nouveau texte", "pending"]),
    );
    expect(result).toStrictEqual({ added: 1, updated: 1, skipped: 0, unchanged: 0, empty: 0 });
    expect(memory.get("Hello")).toMatchObject({ target: "Salut", status: "reviewed" });
    expect(memory.get("New text")).toMatchObject({ target: "Nouveau texte", status: "reviewed" });
  });

  it("leaves untouched rows as they are, unless marked reviewed", () => {
    const memory = sampleMemory();
    memory.recordMachine("Good night", "Bonne nuit", "mistral-small");
    const result = importReviewCsv(
      memory,
      csv(["Hello", "Bonjour", "machine"], ["Good night", "Bonne nuit", "reviewed"], ["Go to town", "", "failed"]),
    );
    expect(result).toStrictEqual({ added: 0, updated: 1, skipped: 0, unchanged: 1, empty: 1 });
    expect(memory.get("Hello")?.status).toBe("machine");
    expect(memory.get("Good night")?.status).toBe("reviewed");
  });

  it("keeps existing translations when asked to", () => {
    const memory = sampleMemory();
    const result = importReviewCsv(memory, csv(["Hello", "Salut", ""], ["New text", "Nouveau", ""]), { keep: true });
    expect(result).toStrictEqual({ added: 1, updated: 0, skipped: 1, unchanged: 0, empty: 0 });
    expect(memory.get("Hello")?.target).toBe("Bonjour");
  });

  it("finds the columns by name, in any order, and ignores blank lines", () => {
    const memory = sampleMemory();
    importReviewCsv(memory, "target,source\r\nSalut,Hello\r\n\r\n");
    expect(memory.get("Hello")?.target).toBe("Salut");
  });

  it("requires the source and target columns", () => {
    expect(() => importReviewCsv(sampleMemory(), "source,text\r\nHello,Salut\r\n")).toThrow(CsvError);
    expect(() => importReviewCsv(sampleMemory(), "source,text\r\nHello,Salut\r\n")).toThrow(/target/);
  });
});
