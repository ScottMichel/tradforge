import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectSources, formatOf } from "../../src/formats/detect.js";

describe("formatOf", () => {
  it("knows the formats by their extension, whatever the case", () => {
    expect(formatOf("locales/en/ui.json")).toBe("json");
    expect(formatOf("media/lua/Camp.LUA")).toBe("lua");
    expect(formatOf("notes.txt")).toBeUndefined();
  });
});

describe("detectSources", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function createFiles(...files: string[]): Promise<void> {
    for (const file of files) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.endsWith(".lua") ? 'say("Hello there")' : '{"a": "Hello"}');
    }
  }

  it("proposes one source per language folder, with the language replaced in the output", async () => {
    await createFiles("locales/en/ui.json", "locales/en/items.json", "game/Translate/EN/menu.json");
    const { sources } = await detectSources(root, "en");
    expect(sources).toEqual([
      { format: "json", include: ["game/Translate/EN/*.json"], output: "game/Translate/{lang}/{name}{ext}", files: 1 },
      { format: "json", include: ["locales/en/*.json"], output: "locales/{lang}/{name}{ext}", files: 2 },
    ]);
  });

  it("recognises a language in the file name, and the English name of the language", async () => {
    await createFiles("i18n/menu.en.json", "texts/english/intro.json");
    const { sources } = await detectSources(root, "en");
    expect(sources).toEqual([
      { format: "json", include: ["i18n/menu.en.json"], output: "i18n/menu.{lang}.json", files: 1 },
      { format: "json", include: ["texts/english/*.json"], output: "texts/{lang}/{name}{ext}", files: 1 },
    ]);
  });

  it("keeps every Lua file, and writes their translations in a separate folder", async () => {
    await createFiles("scripts/camp.lua", "scripts/npc/guard.lua", "init.lua");
    const { sources } = await detectSources(root, "en");
    expect(sources).toEqual([
      {
        format: "lua",
        include: ["*.lua", "scripts/*.lua", "scripts/npc/*.lua"],
        output: "translations/{lang}/{dir}/{name}{ext}",
        files: 3,
      },
    ]);
  });

  it("explains which files it left out, and why", async () => {
    await createFiles("package.json", "tsconfig.base.json", "data/stats.json", "notes.txt", "locales/en/ui.json");
    const { skipped } = await detectSources(root, "en");
    expect(skipped).toEqual([
      { file: "data/stats.json", reason: "no language marker in its path (like locales/en/ or ui.en.json)" },
      { file: "package.json", reason: "configuration file of a tool" },
      { file: "tsconfig.base.json", reason: "configuration file of a tool" },
    ]);
  });
});
