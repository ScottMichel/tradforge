import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import { androidReader } from "../../../../src/formats/apps/android/reader.js";
import { androidLanguage, decodeAndroid, encodeAndroid } from "../../../../src/formats/apps/android/resources.js";
import { strings } from "./fixtures.js";

const file = "app/src/main/res/values/strings.xml";
const read = (content: string) => androidReader.read({ file, content, priority: 0 });

describe("androidReader", () => {
  it("reads strings, string arrays and plurals, but not what is not translatable", () => {
    expect(read(strings).map((occurrence) => [occurrence.location.key, occurrence.source])).toEqual([
      ["app_name", "The Cold Forge"],
      ["welcome", 'Welcome back, <xliff:g id="name" example="Bob">%1$s</xliff:g>! It\'s cold.'],
      ["long", "A long text on two lines"],
      ["spaced", "  Keep   these spaces  "],
      ["styled", "Press <b>Quit</b> to leave & rest"],
      ["ref", '@forge and "quotes"\nNew line'],
      ["days.0", "Monday"],
      ["days.1", "Tuesday"],
      ["bars.one", "%d bar left"],
      ["bars.other", "%d bars left"],
    ]);
  });

  it("gives the line, and one group per array or plural", () => {
    const occurrences = read(strings);
    expect(occurrences[0]).toStrictEqual({
      source: "The Cold Forge",
      location: { file, key: "app_name", line: 4 },
      priority: 0,
    });
    expect(occurrences[6]?.group).toBe(`${file}#days`);
    expect(occurrences[9]?.group).toBe(`${file}#bars`);
  });

  it("names the file of a document that is not a resource file", () => {
    expect(() => read("<manifest/>")).toThrow(
      new ReadError(file, "not an Android resource file (its root is <manifest>)"),
    );
    expect(() => read("<resources><string name='a'>A</resources>")).toThrow(ReadError);
  });
});

describe("decodeAndroid / encodeAndroid", () => {
  it("decodes the escapes, the quotes and the spaces as Android does", () => {
    expect(decodeAndroid([{ kind: "text", value: "  Two\n   lines \\n\\t\\u00e9 \\'ok\\' \"  kept  \" " }])).toBe(
      "Two lines \n\t\u{e9} 'ok'   kept  ",
    );
  });

  it("encodes a translation that decodes back to itself", () => {
    const tricky = ["@home", "?attr", 'It\'s "here"', "  two  spaces ", "Line\nbreak\ttab \\ slash", "a < b & c"];
    for (const text of tricky) {
      const encoded = encodeAndroid([{ kind: "text", value: text }], false);
      expect(decodeAndroid([{ kind: "text", value: unescapeXml(encoded) }])).toBe(text);
    }
    expect(encodeAndroid([{ kind: "text", value: "Été" }], true)).toBe("&#201;t&#233;");
  });
});

describe("androidLanguage", () => {
  it("writes the resource qualifier of a language", () => {
    expect(androidLanguage("fr")).toBe("fr");
    expect(androidLanguage("pt-BR")).toBe("pt-rBR");
    expect(androidLanguage("zh_TW")).toBe("zh-rTW");
    expect(androidLanguage("zh-Hant-TW")).toBe("b+zh+Hant+TW");
    expect(androidLanguage("es-419")).toBe("b+es+419");
  });
});

function unescapeXml(text: string): string {
  return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}
