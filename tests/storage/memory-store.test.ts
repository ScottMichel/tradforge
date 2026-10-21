import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TranslationMemory } from "../../src/core/memory.js";
import {
  loadMemory,
  MemoryFileError,
  memoryFilePath,
  parseMemoryFile,
  saveMemory,
  serializeMemory,
} from "../../src/storage/memory-store.js";

const languages = { sourceLanguage: "en", targetLanguage: "fr" };
const date = new Date("2026-01-01T00:00:00.000Z");

function sampleMemory(): TranslationMemory {
  const memory = new TranslationMemory({ languages, clock: () => date });
  memory.recordMachine("b", "B", "mistral-small");
  memory.importTranslation("a", "A");
  memory.recordFailure("Go to town", "added by the translation: {town}", "mistral-small");
  return memory;
}

function checkedMemory(): TranslationMemory {
  const memory = sampleMemory();
  memory.recordCheck("b", "B", { verdict: "nuance", note: "Close.", backTranslation: "Bee", model: "judge" });
  return memory;
}

describe("serializeMemory / parseMemoryFile", () => {
  it("writes a versioned, sorted, indented JSON file", () => {
    expect(serializeMemory(sampleMemory())).toBe(
      `{
  "version": 1,
  "sourceLanguage": "en",
  "targetLanguage": "fr",
  "entries": [
    {
      "source": "a",
      "target": "A",
      "status": "reviewed",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "source": "b",
      "target": "B",
      "status": "machine",
      "model": "mistral-small",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "failures": [
    {
      "source": "Go to town",
      "reason": "added by the translation: {town}",
      "attempts": 1,
      "model": "mistral-small",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
`,
    );
  });

  it("writes the check of a translation after its other fields", () => {
    const entry = JSON.parse(serializeMemory(checkedMemory())).entries[1];
    expect(Object.keys(entry)).toEqual(["source", "target", "status", "model", "updatedAt", "check"]);
    expect(Object.keys(entry.check)).toEqual(["verdict", "note", "backTranslation", "model", "checkedAt"]);
  });

  it("reads back what it wrote", () => {
    const memory = checkedMemory();
    const data = parseMemoryFile(JSON.parse(serializeMemory(memory)));
    expect(data.languages).toStrictEqual(languages);
    expect(data.entries).toStrictEqual(memory.entryList());
    expect(data.failures).toStrictEqual(memory.failureList());
  });

  it.each([
    [null, /must be an object/],
    [{ version: 2 }, /unsupported version 2/],
    [{ version: 1, sourceLanguage: "en", entries: [], failures: [] }, /targetLanguage/],
    [
      { version: 1, sourceLanguage: "en", targetLanguage: "fr", entries: [{ source: "a", target: "A" }], failures: [] },
      /entries\[0\]\.status/,
    ],
    [
      { version: 1, sourceLanguage: "en", targetLanguage: "fr", entries: [], failures: [{ source: "a", attempts: 0 }] },
      /failures\[0\]\.reason/,
    ],
    [
      {
        version: 1,
        sourceLanguage: "en",
        targetLanguage: "fr",
        entries: [
          {
            source: "a",
            target: "A",
            status: "machine",
            updatedAt: "2026-01-01T00:00:00.000Z",
            check: { verdict: "perfect", note: "", backTranslation: "a", model: "m", checkedAt: "x" },
          },
        ],
        failures: [],
      },
      /entries\[0\]\.check\.verdict/,
    ],
  ])("rejects %j", (raw, message) => {
    expect(() => parseMemoryFile(raw)).toThrow(MemoryFileError);
    expect(() => parseMemoryFile(raw)).toThrow(message);
  });
});

describe("loadMemory / saveMemory", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = path.join(await mkdtemp(path.join(tmpdir(), "tradforge-")), ".tradforge");
  });

  afterEach(async () => {
    await rm(path.dirname(workDir), { recursive: true, force: true });
  });

  it("starts with an empty memory when there is no file yet", async () => {
    const memory = await loadMemory(workDir, languages);
    expect(memory.entryList()).toEqual([]);
    expect(memory.languages).toStrictEqual(languages);
  });

  it("creates the work directory and reads back what it saved", async () => {
    await saveMemory(workDir, sampleMemory());
    const loaded = await loadMemory(workDir, languages);
    expect(loaded.entryList()).toStrictEqual(sampleMemory().entryList());
    expect(loaded.failureList()).toStrictEqual(sampleMemory().failureList());
    expect(await readFile(memoryFilePath(workDir), "utf8")).toBe(serializeMemory(sampleMemory()));
  });

  it("refuses a memory made for other languages", async () => {
    await saveMemory(workDir, sampleMemory());
    await expect(loadMemory(workDir, { sourceLanguage: "en", targetLanguage: "de" })).rejects.toThrow(
      /en → fr.*en → de/,
    );
  });

  it("names the file when its content is not valid JSON", async () => {
    await saveMemory(workDir, sampleMemory());
    await writeFile(memoryFilePath(workDir), "{ broken");
    await expect(loadMemory(workDir, languages)).rejects.toThrow(MemoryFileError);
    await expect(loadMemory(workDir, languages)).rejects.toThrow(/memory\.json/);
  });
});
