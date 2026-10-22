import { describe, expect, it } from "vitest";
import { pzLanguageCode } from "../../../../src/formats/games/zomboid-txt/languages.js";
import { pzReader } from "../../../../src/formats/games/zomboid-txt/reader.js";
import { pzWriter } from "../../../../src/formats/games/zomboid-txt/writer.js";

const file = "media/lua/shared/Translate/EN/UI_EN.txt";
const read = (content: string) => pzReader.read({ file, content, priority: 0 });
const entries = (content: string) => read(content).map((o) => [o.location.key, o.source]);

describe("pzLanguageCode", () => {
  it.each([
    ["en", "EN"],
    ["fr", "FR"],
    ["pt-BR", "PTBR"],
    ["zh-CN", "CN"],
    ["zh-TW", "CH"],
    ["ja", "JP"],
    ["uk", "UA"],
    ["es-MX", "ES_MX"],
    ["xx", "XX"],
  ])("maps %j to the game folder %j", (code, folder) => {
    expect(pzLanguageCode(code)).toBe(folder);
  });
});

describe("pzReader", () => {
  it("reads the entries of a Build 41 translation table", () => {
    const content = 'UI_EN = {\n    UI_Play = "Play",\n    UI_Quit = "Quit game",\n}\n';
    expect(entries(content)).toEqual([
      ["UI_Play", "Play"],
      ["UI_Quit", "Quit game"],
    ]);
  });

  it("accepts the variants found in real mods: separators, headers, odd keys", () => {
    const content = [
      "UI_EN {",
      '  UI_A = "Semicolon";',
      '  UI_B = "No separator"',
      '  UI_C 2 = "Key with a space",',
      '  Tooltip_[Hat]Name\t= "Key with brackets",',
      "}",
    ].join("\r\n");
    expect(entries(content)).toEqual([
      ["UI_A", "Semicolon"],
      ["UI_B", "No separator"],
      ["UI_C 2", "Key with a space"],
      ["Tooltip_[Hat]Name", "Key with brackets"],
    ]);
  });

  it("takes the text between the first and the last quote, like the game does", () => {
    expect(entries('T = {\n  UI_Say = "He said "hello" twice",\n}')).toEqual([["UI_Say", 'He said "hello" twice']]);
  });

  it("skips line comments and block comments, even over several lines", () => {
    const content = [
      "T = {",
      '  -- UI_Old = "Old",',
      "  /* a block",
      '     UI_Hidden = "Hidden",',
      "  */",
      "  /* one line */ ",
      '  UI_Kept = "Kept",',
      "}",
    ].join("\n");
    expect(entries(content)).toEqual([["UI_Kept", "Kept"]]);
  });

  it("joins texts continued on the next lines with ..", () => {
    const content = 'T = {\n  UI_Long = "First part, " ..\n    "second part, " ..\n    "end.",\n  UI_Next = "Next",\n}';
    expect(entries(content)).toEqual([
      ["UI_Long", "First part, second part, end."],
      ["UI_Next", "Next"],
    ]);
  });

  it("groups the entries that no blank line separates", () => {
    const content = 'T = {\n  A = "One",\n  B = "Two",\n\n  C = "Three",\n}';
    expect(read(content).map((o) => o.group)).toEqual([`${file}#2`, `${file}#2`, `${file}#5`]);
  });

  it("skips a broken line, like the game, and keeps reading the next ones", () => {
    const content = 'T = {\n  A = "One",\n  B = "Never closed,\n  C = Never opened",\n  D = "Four",\n}';
    expect(entries(content)).toEqual([
      ["A", "One"],
      ["D", "Four"],
    ]);
  });

  it("ends a continued text at a broken continuation line", () => {
    const content = 'T = {\n  A = "One " ..\n  broken,\n  B = "Two",\n}';
    expect(entries(content)).toEqual([
      ["A", "One "],
      ["B", "Two"],
    ]);
  });
});

describe("pzWriter", () => {
  const translations = new Map([
    ["Play", "Jouer"],
    ["Quit game", 'Quitter "vraiment" le jeu'],
    ["First part, second part, end.", "Première partie, fin."],
  ]);
  const write = (content: string, target = "fr") =>
    pzWriter.write({
      file,
      content,
      translate: (source) => translations.get(source),
      options: { asciiOnly: false, untranslated: "keep-source" },
      languages: { source: "en", target },
    });

  it("replaces the texts in place, renames the table and keeps everything else", () => {
    const content =
      'UI_EN = {\r\n    UI_Play = "Play",\r\n    -- note\r\n    UI_Quit = "Quit game";\r\n    UI_Other = "Other",\r\n}\r\n';
    const result = write(content);
    expect(result.content).toBe(
      'UI_FR = {\r\n    UI_Play = "Jouer",\r\n    -- note\r\n    UI_Quit = "Quitter "vraiment" le jeu";\r\n    UI_Other = "Other",\r\n}\r\n',
    );
    expect(result).toMatchObject({ translated: 2, untranslated: 1 });
    expect(write(content, "pt-BR").content.startsWith("UI_PTBR = {")).toBe(true);
  });

  it("copies a broken line as it is", () => {
    const content = 'T = {\n  A = "Play",\n  B = "Never closed,\n}';
    expect(write(content).content).toBe('T = {\n  A = "Jouer",\n  B = "Never closed,\n}');
  });

  it("writes a continued text back on one line", () => {
    const content = 'T = {\n  UI_Long = "First part, " ..\n    "second part, " ..\n    "end.",\n  UI_Next = "Next",\n}';
    expect(write(content).content).toBe('T = {\n  UI_Long = "Première partie, fin.",\n  UI_Next = "Next",\n}');
  });

  it("writes files that the reader reads back as the translations", () => {
    const content = 'UI_EN = {\n  A = "Play",\n  B = "Quit game",\n  C = "Other",\n}\n';
    const written = write(content).content;
    expect(pzReader.read({ file: "UI_FR.txt", content: written, priority: 0 }).map((o) => o.source)).toEqual([
      "Jouer",
      'Quitter "vraiment" le jeu',
      "Other",
    ]);
  });
});
