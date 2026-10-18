import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import type { WriterInput } from "../../../src/core/writer.js";
import { jsonReader } from "../../../src/formats/json/reader.js";
import { jsonWriter } from "../../../src/formats/json/writer.js";

const translations = new Map([
  ["Welcome", "Bienvenue"],
  ["Play", "Jouer"],
  ["Eat", "Mangez"],
  ["Café ☕ 😀", "Café ☕ 😀 !"],
]);

const write = (content: string, options: Partial<WriterInput["options"]> = {}) =>
  jsonWriter.write({
    file: "locales/en/ui.json",
    content,
    translate: (source) => translations.get(source),
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
  });

const source = `{
  "title": "Welcome",
  "count": 3,
  "enabled": true,
  "missing": null,
  "blank": " ",
  "menu": { "play": "Play", "quit": "Quit" },
  "tips": ["Eat", "Sleep"]
}
`;

describe("jsonWriter", () => {
  it("replaces translated strings and keeps everything else, key order and indentation included", () => {
    const result = write(source);
    expect(result.content).toBe(`{
  "title": "Bienvenue",
  "count": 3,
  "enabled": true,
  "missing": null,
  "blank": " ",
  "menu": {
    "play": "Jouer",
    "quit": "Quit"
  },
  "tips": [
    "Mangez",
    "Sleep"
  ]
}
`);
    expect(result).toMatchObject({ translated: 3, untranslated: 2 });
  });

  it("can leave untranslated keys out, but never array items (indexes would shift)", () => {
    const parsed = JSON.parse(write(source, { untranslated: "omit" }).content);
    expect(parsed.menu).toEqual({ play: "Jouer" });
    expect(parsed.tips).toEqual(["Mangez", "Sleep"]);
  });

  it("follows the indentation of the source file", () => {
    expect(write('{\n\t"title": "Welcome"\n}').content).toBe('{\n\t"title": "Bienvenue"\n}');
    expect(write('{\n    "a": {\n        "b": "Play"\n    }\n}\n').content).toBe(
      '{\n    "a": {\n        "b": "Jouer"\n    }\n}\n',
    );
  });

  it("can escape every non-ASCII character, and the result still reads the same", () => {
    const content = write('{"drink": "Café ☕ 😀"}', { asciiOnly: true }).content;
    expect(content).toBe('{\n  "drink": "Caf\\u00e9 \\u2615 \\ud83d\\ude00 !"\n}');
    expect(JSON.parse(content)).toEqual({ drink: "Café ☕ 😀 !" });
  });

  it("writes texts that the JSON reader reads back as the translations", () => {
    const written = write(source).content;
    const read = jsonReader.read({ file: "ui.fr.json", content: written, priority: 0 }).map((o) => o.source);
    expect(read).toEqual(["Bienvenue", "Jouer", "Quit", "Mangez", "Sleep"]);
  });

  it("keeps a __proto__ key as a plain key", () => {
    expect(JSON.parse(write('{"__proto__": "Play"}').content)).toEqual(JSON.parse('{"__proto__": "Jouer"}'));
  });

  it("names the file when the source JSON is invalid", () => {
    expect(() => write("{ broken")).toThrow(ReadError);
    expect(() => write("{ broken")).toThrow(/locales\/en\/ui\.json/);
  });
});
