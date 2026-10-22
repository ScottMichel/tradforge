import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../../../src/core/config.js";
import { TranslationMemory } from "../../../src/core/memory.js";
import { buildProject } from "../../../src/formats/project/build.js";
import { extractSegments } from "../../../src/formats/project/extract.js";
import { listProjectFiles, OutputError, outputPath } from "../../../src/formats/project/project.js";

describe("outputPath", () => {
  const languages = { source: "en", target: "fr" };

  it("fills the placeholders from the source file and the target language", () => {
    expect(outputPath("{dir}/{name}.{lang}{ext}", "locales/en/ui.json", languages)).toBe("locales/en/ui.fr.json");
    expect(outputPath("locales/{lang}/{name}{ext}", "locales/en/ui.json", languages)).toBe("locales/fr/ui.json");
    expect(outputPath("{dir}/{name}.{lang}{ext}", "ui.json", languages)).toBe("ui.fr.json");
  });

  it("offers the language in capitals, and the file name without its language suffix", () => {
    const template = "Translate/{LANG}/{stem}_{LANG}{ext}";
    expect(outputPath(template, "Translate/EN/UI_EN.txt", languages)).toBe("Translate/FR/UI_FR.txt");
    expect(outputPath("{dir}/{stem}.{lang}{ext}", "i18n/menu.en.json", languages)).toBe("i18n/menu.fr.json");
    expect(outputPath("{stem}-{LANG}{ext}", "readme.txt", { source: "en", target: "pt-BR" })).toBe("readme-PT_BR.txt");
  });

  it("offers the English name of the language, as some games name their folders", () => {
    const template = "localisation/{language}/{stem}_l_{language}{ext}";
    expect(outputPath(template, "localisation/english/ui_l_english.yml", languages)).toBe(
      "localisation/french/ui_l_french.yml",
    );
  });

  it("does not fill a placeholder that comes from a file name", () => {
    expect(outputPath("out/{name}-{lang}{ext}", "{lang}.json", languages)).toBe("out/{lang}-fr.json");
  });
});

describe("buildProject", () => {
  let root: string;
  const memory = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
  memory.recordMachine("Welcome", "Bienvenue", "m");
  memory.importTranslation("Welcome to the camp", "Bienvenue au camp");

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-"));
    await createFile("locales/en/ui.json", '{\n  "title": "Welcome",\n  "quit": "Quit"\n}\n');
    await createFile("lua/camp.lua", 'player:Say("Welcome to the camp")\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function createFile(file: string, content: string): Promise<void> {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  const read = (file: string) => readFile(path.join(root, file), "utf8");

  const configWith = (sources: unknown[]) => parseConfig({ sourceLanguage: "en", targetLanguage: "fr", sources });

  const defaultConfig = configWith([
    { format: "json", include: ["locales/en/*.json"] },
    { format: "lua", include: ["lua/*.lua"], output: { path: "out/{lang}/{name}{ext}", asciiOnly: true } },
  ]);

  it("writes every translated file and reports what it did, sorted by output", async () => {
    const report = await buildProject(root, defaultConfig, memory);
    expect(report).toStrictEqual([
      { source: "locales/en/ui.json", output: "locales/en/ui.fr.json", translated: 1, untranslated: 1, written: true },
      { source: "lua/camp.lua", output: "out/fr/camp.lua", translated: 1, untranslated: 0, written: true },
    ]);
    expect(await read("locales/en/ui.fr.json")).toBe('{\n  "title": "Bienvenue",\n  "quit": "Quit"\n}\n');
    expect(await read("out/fr/camp.lua")).toBe('player:Say("Bienvenue au camp")\n');
  });

  it("never takes its own outputs for sources, when building or extracting again", async () => {
    await buildProject(root, defaultConfig, memory);
    const files = await listProjectFiles(root, defaultConfig);
    expect(files.map((f) => f.file)).toEqual(["locales/en/ui.json", "lua/camp.lua"]);
    const segments = await extractSegments(root, defaultConfig);
    expect(segments.map((s) => s.source)).not.toContain("Bienvenue");
  });

  it("does not rewrite a file whose content is already up to date", async () => {
    await buildProject(root, defaultConfig, memory);
    const before = (await stat(path.join(root, "locales/en/ui.fr.json"))).mtimeMs;
    const report = await buildProject(root, defaultConfig, memory);
    expect(report.map((f) => f.written)).toEqual([false, false]);
    expect((await stat(path.join(root, "locales/en/ui.fr.json"))).mtimeMs).toBe(before);
  });

  it.each([
    [{ path: "{dir}/{name}{ext}" }, /would overwrite its source/],
    [{ path: "../{name}.{lang}{ext}" }, /outside the project/],
    [{ path: "out/{lang}.json" }, /same output/],
  ])("refuses the output %j", async (output, message) => {
    await createFile("locales/en/items.json", '{"axe": "Axe"}');
    const config = configWith([{ format: "json", include: ["locales/en/*.json"], output }]);
    await expect(buildProject(root, config, memory)).rejects.toThrow(OutputError);
    await expect(buildProject(root, config, memory)).rejects.toThrow(message);
  });

  it("writes the outputs in the configured encoding, and refuses characters it cannot hold", async () => {
    const legacy = configWith([
      { format: "json", include: ["locales/en/*.json"], output: { path: "out/{name}{ext}", encoding: "windows-1252" } },
    ]);
    const accents = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
    accents.recordMachine("Welcome", "Bienvenue à l'été", "m");
    await buildProject(root, legacy, accents);
    const bytes = await readFile(path.join(root, "out/ui.json"));
    expect(bytes.includes(0xe9)).toBe(true); // é as the single windows-1252 byte
    expect(bytes.includes(0xc3)).toBe(false); // and not as UTF-8

    accents.recordMachine("Quit", "終了", "m");
    await expect(buildProject(root, legacy, accents)).rejects.toThrow(OutputError);
    await expect(buildProject(root, legacy, accents)).rejects.toThrow(/out\/ui\.json.*"終".*windows-1252/);
  });

  it("refuses to replace a big output with a much smaller one, unless forced", async () => {
    const big = JSON.stringify({ entries: Array.from({ length: 200 }, (_, i) => `Entry ${i}`) });
    await createFile("locales/en/ui.fr.json", big);

    const building = buildProject(root, defaultConfig, memory);
    await expect(building).rejects.toThrow(OutputError);
    await expect(buildProject(root, defaultConfig, memory)).rejects.toThrow(/locales\/en\/ui\.fr\.json.*--force/s);
    expect(await read("locales/en/ui.fr.json")).toBe(big); // nothing written at all
    await expect(read("out/fr/camp.lua")).rejects.toThrow();

    await buildProject(root, defaultConfig, memory, { force: true });
    expect(await read("locales/en/ui.fr.json")).toContain("Bienvenue");
  });
});
