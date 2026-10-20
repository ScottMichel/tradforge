import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig, SOURCE_FORMATS } from "../../src/core/config.js";
import { extractSegments } from "../../src/formats/extract.js";
import { READERS } from "../../src/formats/readers.js";

describe("READERS", () => {
  it("has a reader for every source format", () => {
    for (const format of SOURCE_FORMATS) expect(READERS[format].format).toBe(format);
  });
});

describe("extractSegments", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function createFile(file: string, content: string): Promise<void> {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  it("reads every source, groups identical texts and sorts them by priority", async () => {
    await createFile("locales/en/ui.json", JSON.stringify({ menu: { quit: "Quit", hello: "Hello there" } }));
    await createFile("locales/en/extra.json", JSON.stringify({ greeting: "Hello there" }));
    await createFile("lua/dialogue.lua", 'say("Hello there")\nsay("Welcome to the camp")\nlocal state = "idle"');
    await createFile(".tradforge/memory.json", JSON.stringify({ never: "Read me" }));

    const config = parseConfig({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sources: [
        { format: "json", include: ["locales/en/*.json", "**/*.json"], priority: 5 },
        { format: "lua", include: ["lua/*.lua"], priority: 0, context: "NPC dialogue" },
      ],
    });
    const segments = await extractSegments(root, config);

    expect(segments.map((s) => [s.source, s.priority, s.context])).toEqual([
      ["Hello there", 0, "NPC dialogue"],
      ["Welcome to the camp", 0, "NPC dialogue"],
      ["Quit", 5, undefined],
    ]);
    expect(segments[0]?.locations).toEqual([
      { file: "locales/en/extra.json", key: "greeting" },
      { file: "locales/en/ui.json", key: "menu.hello" },
      { file: "lua/dialogue.lua", line: 1 },
    ]);
  });

  it("applies the grouping rule of each source", async () => {
    await createFile("dialogs/en.json", JSON.stringify({ Dialog_Bob_1: "Hi", Dialog_Bob_2: "Bye", Title: "Camp" }));
    const config = parseConfig({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sources: [{ format: "json", include: ["dialogs/*.json"], group: { keyPattern: "^Dialog_([A-Za-z]+)_" } }],
    });
    const groups = (await extractSegments(root, config)).map((segment) => [segment.source, segment.group]);
    expect(groups).toEqual([
      ["Hi", "dialogs/en.json#Bob"],
      ["Bye", "dialogs/en.json#Bob"],
      ["Camp", undefined],
    ]);
  });
});
