import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import type { WriterInput } from "../../../src/core/writer.js";
import { xcstringsReader } from "../../../src/formats/xcstrings/reader.js";
import { xcstringsWriter } from "../../../src/formats/xcstrings/writer.js";

const file = "Forge/Localizable.xcstrings";

/** A catalog written for the tests, in the layout Xcode writes. */
const catalog = `{
  "sourceLanguage" : "en",
  "strings" : {
    "app_name" : {
      "comment" : "Title of the main window",
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Die kalte Schmiede"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "The Cold Forge"
          }
        }
      }
    },
    "Welcome back, %@!" : {

    },
    "bars" : {
      "localizations" : {
        "en" : {
          "variations" : {
            "plural" : {
              "one" : {
                "stringUnit" : {
                  "state" : "translated",
                  "value" : "%lld bar left"
                }
              },
              "other" : {
                "stringUnit" : {
                  "state" : "translated",
                  "value" : "%lld bars left"
                }
              }
            }
          }
        }
      }
    },
    "FORGE" : {
      "shouldTranslate" : false
    },
    "%@ and %@" : {
      "localizations" : {
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "%#@first@ and %#@second@"
          },
          "substitutions" : {
            "first" : {
              "formatSpecifier" : "lld"
            }
          }
        }
      }
    }
  },
  "version" : "1.0"
}
`;

describe("xcstringsReader", () => {
  it("reads the source language value of every string, the key itself when it has none", () => {
    const occurrences = xcstringsReader.read({ file, content: catalog, priority: 0 });
    expect(occurrences.map((o) => [o.location.key, o.source, o.context, o.group])).toEqual([
      ["app_name", "The Cold Forge", "Title of the main window", undefined],
      ["Welcome back, %@!", "Welcome back, %@!", undefined, undefined],
      ["bars/plural/one", "%lld bar left", undefined, `${file}#bars`],
      ["bars/plural/other", "%lld bars left", undefined, `${file}#bars`],
    ]);
  });

  it("names the file of a document that is not a string catalog", () => {
    expect(() => xcstringsReader.read({ file, content: "{}", priority: 0 })).toThrow(
      new ReadError(file, 'not a string catalog (no "sourceLanguage" and "strings")'),
    );
  });
});

describe("xcstringsWriter", () => {
  const translations: Record<string, string> = {
    "The Cold Forge": "La forge froide",
    "Welcome back, %@!": "Bon retour, %@ !",
    "%lld bar left": "Il reste %lld lingot",
    "%lld bars left": "Il reste %lld lingots",
  };
  const write = (content: string, table: Record<string, string>, target = "fr") =>
    xcstringsWriter.write({
      file,
      content,
      translate: (source) => table[source],
      options: { asciiOnly: false, untranslated: "keep-source" } satisfies WriterInput["options"],
      languages: { source: "en", target },
    });

  it("adds the target language to each string, in the layout of Xcode, other languages untouched", () => {
    const result = write(catalog, translations);
    const data = JSON.parse(result.content);
    expect(Object.keys(data.strings.app_name.localizations)).toEqual(["de", "en", "fr"]);
    expect(data.strings.app_name.localizations.fr).toEqual({
      stringUnit: { state: "translated", value: "La forge froide" },
    });
    expect(data.strings.app_name.localizations.de.stringUnit.value).toBe("Die kalte Schmiede");
    expect(data.strings["Welcome back, %@!"].localizations.fr.stringUnit.value).toBe("Bon retour, %@ !");
    expect(data.strings.FORGE).toEqual({ shouldTranslate: false });
    expect(result.content).toContain('"fr" : {\n          "stringUnit" : {\n            "state" : "translated",');
    expect(result.content.endsWith("}\n")).toBe(true);
    expect(result).toMatchObject({ translated: 4, untranslated: 0 });
  });

  it("writes the plural categories of the target language", () => {
    const plural = (target: string) =>
      Object.keys(
        JSON.parse(write(catalog, translations, target).content).strings.bars.localizations[target].variations.plural,
      );
    expect(plural("fr")).toEqual(["one", "many", "other"]);
    expect(plural("ja")).toEqual(["other"]);
    const fr = JSON.parse(write(catalog, translations).content).strings.bars.localizations.fr.variations.plural;
    expect(fr.many.stringUnit.value).toBe("Il reste %lld lingots");
  });

  it("keeps an existing translation that the memory does not have", () => {
    const result = write(catalog, translations, "de");
    expect(JSON.parse(result.content).strings.app_name.localizations.de.stringUnit.value).toBe("La forge froide");
    const kept = write(catalog, {}, "de");
    expect(JSON.parse(kept.content).strings.app_name.localizations.de.stringUnit.value).toBe("Die kalte Schmiede");
    expect(kept.content).toBe(catalog);
  });
});
