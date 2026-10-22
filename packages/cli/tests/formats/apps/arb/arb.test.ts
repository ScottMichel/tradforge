import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import type { WriterInput } from "../../../../src/core/writer.js";
import { arbReader } from "../../../../src/formats/apps/arb/reader.js";
import { arbWriter } from "../../../../src/formats/apps/arb/writer.js";

const file = "lib/l10n/app_en.arb";

const arb = `{
  "@@locale": "en",
  "appTitle": "The Cold Forge",
  "@appTitle": {
    "description": "Title of the main window"
  },
  "welcome": "Welcome back, {name}!",
  "@welcome": {
    "placeholders": {
      "name": { "type": "String", "example": "Bob" }
    }
  },
  "empty": ""
}
`;

describe("arbReader", () => {
  it("reads every message, its description as context, and none of the metadata", () => {
    expect(arbReader.read({ file, content: arb, priority: 0 })).toEqual([
      {
        source: "The Cold Forge",
        location: { file, key: "appTitle" },
        priority: 0,
        context: "Title of the main window",
      },
      { source: "Welcome back, {name}!", location: { file, key: "welcome" }, priority: 0 },
    ]);
  });

  it("names the file of a document that is not an object", () => {
    expect(() => arbReader.read({ file, content: "[]", priority: 0 })).toThrow(
      new ReadError(file, "an .arb file must hold an object"),
    );
  });
});

describe("arbWriter", () => {
  const write = (
    content: string,
    table: Record<string, string>,
    options: Partial<WriterInput["options"]> = {},
    target = "fr",
  ) =>
    arbWriter.write({
      file,
      content,
      translate: (source) => table[source],
      options: { asciiOnly: false, untranslated: "keep-source", ...options },
      languages: { source: "en", target },
    });

  it("translates the messages, names the locale, and keeps the metadata", () => {
    const result = write(
      arb,
      { "The Cold Forge": "La forge froide", "Welcome back, {name}!": "Bon retour, {name} !" },
      {},
      "pt-BR",
    );
    expect(JSON.parse(result.content)).toEqual({
      "@@locale": "pt_BR",
      appTitle: "La forge froide",
      "@appTitle": { description: "Title of the main window" },
      welcome: "Bon retour, {name} !",
      "@welcome": { placeholders: { name: { type: "String", example: "Bob" } } },
      empty: "",
    });
    expect(result.content.startsWith('{\n  "@@locale": "pt_BR",\n')).toBe(true);
    expect(result).toMatchObject({ translated: 2, untranslated: 0 });
  });

  it("leaves an untranslated message out with omit, its metadata with it", () => {
    const result = JSON.parse(write(arb, { "The Cold Forge": "La forge froide" }, { untranslated: "omit" }).content);
    expect(Object.keys(result)).toEqual(["@@locale", "appTitle", "@appTitle", "empty"]);
  });
});
