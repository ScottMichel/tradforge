import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectSources, formatOf } from "../../src/formats/detect.js";

describe("formatOf", () => {
  it("knows the formats by their extension, whatever the case", () => {
    expect(formatOf("locales/en/ui.json")).toBe("json");
    expect(formatOf("media/lua/Camp.LUA")).toBe("lua");
    expect(formatOf("po/forge.pot")).toBe("po");
    expect(formatOf("po/fr.PO")).toBe("po");
    expect(formatOf("src/locale/messages.xlf")).toBe("xliff");
    expect(formatOf("app.xliff")).toBe("xliff");
    expect(formatOf("config/locales/en.yml")).toBe("yaml");
    expect(formatOf("App/en.lproj/Localizable.strings")).toBe("ios-strings");
    expect(formatOf("messages.en.YAML")).toBe("yaml");
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
      { format: "json", include: ["game/Translate/EN/*.json"], output: "game/Translate/{LANG}/{name}{ext}", files: 1 },
      { format: "json", include: ["locales/en/*.json"], output: "locales/{lang}/{name}{ext}", files: 2 },
    ]);
  });

  it("recognises a language in the file name, and the English name of the language", async () => {
    await createFiles("i18n/menu.en.json", "texts/english/intro.json");
    const { sources } = await detectSources(root, "en");
    expect(sources).toEqual([
      { format: "json", include: ["i18n/menu.en.json"], output: "i18n/menu.{lang}.json", files: 1 },
      { format: "json", include: ["texts/english/*.json"], output: "texts/{language}/{name}{ext}", files: 1 },
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

  it("recognises Project Zomboid translations, both Build 41 tables and Build 42 JSON, with the game's codes", async () => {
    const translate = "mods/Camp/media/lua/shared/Translate";
    await createFiles(`${translate}/EN/UI_EN.txt`, `${translate}/EN/IG_UI_EN.txt`, `${translate}/EN/ItemName.json`);
    const { sources } = await detectSources(root, "en", "pt-BR");
    expect(sources).toEqual([
      { format: "json", include: [`${translate}/EN/*.json`], output: `${translate}/PTBR/{name}{ext}`, files: 1 },
      {
        format: "zomboid-txt",
        include: [`${translate}/EN/*_EN.txt`],
        output: `${translate}/PTBR/{stem}_PTBR{ext}`,
        files: 2,
      },
    ]);
  });

  it("suggests the subtitles of the source language, written next to them with the target language", async () => {
    await createFiles("movies/trip.en.srt", "movies/trip.de.srt", "movies/talk.vtt", "movies/talk.fr.vtt");
    const { sources, skipped } = await detectSources(root, "en", "fr");
    expect(sources).toEqual([
      { format: "srt", include: ["movies/*.en.srt"], output: "{dir}/{stem}.{lang}{ext}", files: 1 },
      { format: "vtt", include: ["movies/talk.vtt"], output: "{dir}/{stem}.{lang}{ext}", files: 1 },
    ]);
    expect(skipped).toEqual([
      { file: "movies/talk.fr.vtt", reason: "subtitles in another language (French)" },
      { file: "movies/trip.de.srt", reason: "subtitles in another language (German)" },
    ]);
  });

  it("recognises Paradox localisation files, with the game's language names and the required BOM", async () => {
    await createFiles("mod/localisation/english/forge_l_english.yml", "mod/localisation/english/forge_l_english.yml");
    const { sources } = await detectSources(root, "en", "pt-BR");
    expect(sources).toEqual([
      {
        format: "paradox-yml",
        include: ["mod/localisation/english/*_l_english.yml"],
        output: "mod/localisation/braz_por/{stem}_l_braz_por{ext}",
        encoding: "utf-8-bom",
        files: 1,
      },
    ]);
  });

  it("recognises RimWorld language files by their folders and their LanguageData root", async () => {
    const english = "Mods/Forge/Languages/English";
    await createFiles(`${english}/Keyed/Forge.xml`, `${english}/DefInjected/ThingDef/Tools.xml`);
    await createFiles(`${english}/LanguageInfo.xml`);
    for (const file of [`${english}/Keyed/Forge.xml`, `${english}/DefInjected/ThingDef/Tools.xml`]) {
      await writeFile(
        path.join(root, file),
        "<?xml version='1.0'?>\n<LanguageData>\n  <A>Hammer</A>\n</LanguageData>\n",
      );
    }
    await writeFile(
      path.join(root, `${english}/LanguageInfo.xml`),
      "<LanguageInfo><friendlyNameEnglish/></LanguageInfo>",
    );
    const { sources, skipped } = await detectSources(root, "en", "fr");
    expect(sources).toEqual([
      {
        format: "rimworld-xml",
        include: [`${english}/DefInjected/ThingDef/*.xml`],
        output: "Mods/Forge/Languages/French/DefInjected/ThingDef/{name}{ext}",
        files: 1,
      },
      {
        format: "rimworld-xml",
        include: [`${english}/Keyed/*.xml`],
        output: "Mods/Forge/Languages/French/Keyed/{name}{ext}",
        files: 1,
      },
    ]);
    expect(skipped).toEqual([
      { file: `${english}/LanguageInfo.xml`, reason: "not a RimWorld language file (its root is not LanguageData)" },
    ]);
  });

  it("suggests the Ren'Py scripts, without existing translations nor the engine itself", async () => {
    await createFiles(
      "game/script.rpy",
      "game/chapters/one.rpy",
      "game/tl/french/script.rpy",
      "renpy/common/00start.rpy",
    );
    const { sources } = await detectSources(root, "en", "fr");
    expect(sources).toEqual([
      {
        format: "renpy",
        include: ["game/*.rpy", "game/chapters/*.rpy"],
        output: "translations/{lang}/{dir}/{name}{ext}",
        files: 2,
      },
    ]);
  });

  it("proposes gettext templates, and the catalogs of the source language", async () => {
    await createFiles(
      "po/forge.pot",
      "po/fr.po",
      "app/locale/messages.pot",
      "web/locale/en/LC_MESSAGES/django.po",
      "web/locale/de/LC_MESSAGES/django.po",
    );
    const { sources, skipped } = await detectSources(root, "en");
    expect(sources).toEqual([
      {
        format: "po",
        include: ["app/locale/messages.pot"],
        output: "app/locale/{lang}/LC_MESSAGES/{name}.po",
        files: 1,
      },
      { format: "po", include: ["po/forge.pot"], output: "po/{lang}.po", files: 1 },
      {
        format: "po",
        include: ["web/locale/en/LC_MESSAGES/*.po"],
        output: "web/locale/{lang}/LC_MESSAGES/{name}{ext}",
        files: 1,
      },
    ]);
    expect(skipped).toEqual([
      { file: "po/fr.po", reason: "no marker of English in its path (like locale/en/LC_MESSAGES/ or en.po)" },
      {
        file: "web/locale/de/LC_MESSAGES/django.po",
        reason: "no marker of English in its path (like locale/en/LC_MESSAGES/ or en.po)",
      },
    ]);
  });

  it("proposes XLIFF files of the source language that hold no translation yet", async () => {
    const files: Record<string, string> = {
      "src/locale/messages.xlf": '<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en-US">',
      "src/locale/messages.fr.xlf": '<xliff version="1.2"><file source-language="en" target-language="fr">',
      "i18n/en/app.xliff": '<xliff version="2.0" srcLang="en">',
      "i18n/de/app.xliff": '<xliff version="2.0" srcLang="de">',
      "data/layout.xlf": "<layout/>",
    };
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), content);
    }
    const { sources, skipped } = await detectSources(root, "en");
    expect(sources).toEqual([
      { format: "xliff", include: ["i18n/en/*.xliff"], output: "i18n/{lang}/{name}{ext}", files: 1 },
      { format: "xliff", include: ["src/locale/messages.xlf"], output: "src/locale/messages.{lang}.xlf", files: 1 },
    ]);
    expect(skipped).toEqual([
      { file: "data/layout.xlf", reason: "not an XLIFF document" },
      { file: "i18n/de/app.xliff", reason: "its source language is German" },
      { file: "src/locale/messages.fr.xlf", reason: "already a translation into French" },
    ]);
  });

  it("proposes YAML files with a language marker, and leaves the others out", async () => {
    await createFiles(
      "config/locales/en.yml",
      "translations/messages.en.yaml",
      "config/locales/fr.yml",
      ".github/workflows/ci.yml",
      "mod/localisation/english/forge_l_english.yml",
    );
    const { sources, skipped } = await detectSources(root, "en");
    expect(sources.map((source) => [source.format, source.include[0], source.output])).toEqual([
      ["yaml", "config/locales/en.yml", "config/locales/{lang}.yml"],
      [
        "paradox-yml",
        "mod/localisation/english/*_l_english.yml",
        "mod/localisation/{language}/{stem}_l_{language}{ext}",
      ],
      ["yaml", "translations/messages.en.yaml", "translations/messages.{lang}.yaml"],
    ]);
    // Hidden folders such as .github are not even looked at.
    expect(skipped.map((item) => item.file)).toEqual(["config/locales/fr.yml"]);
  });

  it("proposes Android string resources, one source per file, for the folder of the target language", async () => {
    const files: Record<string, string> = {
      "app/src/main/res/values/strings.xml": '<resources><string name="a">Hello</string></resources>',
      "app/src/main/res/values/arrays.xml": '<resources>\n<string-array name="days"/></resources>',
      "app/src/main/res/values/colors.xml": '<resources><color name="red">#F00</color></resources>',
      "app/src/main/res/values-de/strings.xml": '<resources><string name="a">Hallo</string></resources>',
      "app/src/main/AndroidManifest.xml": "<manifest/>",
    };
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), content);
    }
    const { sources, skipped } = await detectSources(root, "en", "pt-BR");
    expect(sources.map((source) => [source.format, source.include[0], source.output])).toEqual([
      ["android", "app/src/main/res/values/arrays.xml", "app/src/main/res/values-pt-rBR/{name}{ext}"],
      ["android", "app/src/main/res/values/strings.xml", "app/src/main/res/values-pt-rBR/{name}{ext}"],
    ]);
    expect(skipped).toEqual([
      {
        file: "app/src/main/res/values-de/strings.xml",
        reason: "Android strings of another language or configuration",
      },
    ]);
  });

  it("proposes the .strings of the source language, or of Base, for the .lproj folder of the target language", async () => {
    await createFiles(
      "App/en.lproj/Localizable.strings",
      "App/Base.lproj/Main.strings",
      "App/de.lproj/Localizable.strings",
      "Tools/notes.strings",
    );
    const { sources, skipped } = await detectSources(root, "en", "pt-BR");
    expect(sources.map((source) => [source.format, source.include[0], source.output])).toEqual([
      ["ios-strings", "App/Base.lproj/*.strings", "App/pt-BR.lproj/{name}{ext}"],
      ["ios-strings", "App/en.lproj/*.strings", "App/pt-BR.lproj/{name}{ext}"],
    ]);
    expect(skipped).toEqual([
      { file: "App/de.lproj/Localizable.strings", reason: "strings of another language" },
      { file: "Tools/notes.strings", reason: "not in a <language>.lproj folder" },
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
