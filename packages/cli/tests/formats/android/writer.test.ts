import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../src/core/writer.js";
import { androidWriter } from "../../../src/formats/android/writer.js";
import { strings } from "./fixtures.js";

const translations = new Map([
  ["The Cold Forge", "La forge froide"],
  [
    'Welcome back, <xliff:g id="name" example="Bob">%1$s</xliff:g>! It\'s cold.',
    'Bon retour, <xliff:g id="name" example="Bob">%1$s</xliff:g> ! Il fait froid, n\'est-ce pas ?',
  ],
  ["A long text on two lines", "Un long texte sur deux lignes"],
  ["  Keep   these spaces  ", "  Gardez   ces espaces  "],
  ["Press <b>Quit</b> to leave & rest", "Appuyez sur <b>Quitter</b> pour partir & vous reposer"],
  ['@forge and "quotes"\nNew line', '@forge et "guillemets"\nNouvelle ligne'],
  ["Monday", "Lundi"],
  ["Tuesday", "Mardi"],
  ["%d bar left", "Il reste %d lingot"],
  ["%d bars left", "Il reste %d lingots"],
]);

const write = (
  content: string,
  options: Partial<WriterInput["options"]> = {},
  target = "fr",
  translate: WriterInput["translate"] = (source) => translations.get(source),
) =>
  androidWriter.write({
    file: "app/src/main/res/values/strings.xml",
    content,
    translate,
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target },
  });

/** Applies exact replacements, each of which must be found. */
function replaced(text: string, ...pairs: [string, string][]): string {
  return pairs.reduce((result, [from, to]) => {
    expect(result).toContain(from);
    return result.replace(from, to);
  }, text);
}

describe("androidWriter", () => {
  it("writes every translation in place, escaped as Android reads it, and drops what is not translatable", () => {
    const result = write(strings);
    expect(result.content).toBe(
      replaced(
        strings,
        [">The Cold Forge<", ">La forge froide<"],
        [
          '>Welcome back, <xliff:g id="name" example="Bob">%1$s</xliff:g>! It\\\'s cold.<',
          '>Bon retour, <xliff:g id="name" example="Bob">%1$s</xliff:g> ! Il fait froid, n\\\'est-ce pas ?<',
        ],
        ['    <string name="logo" translatable="false">FORGE</string>\n', ""],
        [">A long text\n        on two lines<", ">Un long texte sur deux lignes<"],
        ['>"  Keep   these spaces  "<', '>"  Gardez   ces espaces  "<'],
        [">Press <b>Quit</b> to leave &amp; rest<", ">Appuyez sur <b>Quitter</b> pour partir &amp; vous reposer<"],
        ['>\\@forge and \\"quotes\\"\\nNew line<', '>\\@forge et \\"guillemets\\"\\nNouvelle ligne<'],
        [">Monday<", ">Lundi<"],
        [">Tuesday<", ">Mardi<"],
        [
          '<item quantity="one">%d bar left</item>\n        <item quantity="other">%d bars left</item>',
          '<item quantity="one">Il reste %d lingot</item>\n        <item quantity="many">Il reste %d lingots</item>\n        <item quantity="other">Il reste %d lingots</item>',
        ],
      ),
    );
    expect(result).toMatchObject({ translated: 10, untranslated: 0 });
  });

  it("writes the plural forms of the target language", () => {
    const forms = (target: string) =>
      [...write(strings, {}, target).content.matchAll(/quantity="(\w+)"/g)].map((m) => m[1]);
    expect(forms("ja")).toEqual(["other"]);
    expect(forms("ru")).toEqual(["one", "few", "many", "other"]);
    expect(forms("de")).toEqual(["one", "other"]);
  });

  it("leaves untranslated resources as they are, or leaves them out", () => {
    const only = (source: string) => (source === "Monday" ? "Lundi" : undefined);
    const kept = write(strings, {}, "fr", only);
    expect(kept.content).toContain('<string name="app_name">The Cold Forge</string>');
    expect(kept).toMatchObject({ translated: 1, untranslated: 9 });

    const omitted = write(strings, { untranslated: "omit" }, "fr", only).content;
    expect(omitted).not.toContain("app_name");
    expect(omitted).not.toContain("<plurals");
    // An array with one translated item keeps the others: removing them would shift the indexes.
    expect(omitted).toContain("<item>Lundi</item>\n        <item>Tuesday</item>");
    expect(omitted).toContain('<color name="fire">#FF4500</color>');
  });

  it("keeps CRLF line ends and leaves out the byte order mark", () => {
    const content = `\u{feff}${strings.replaceAll("\n", "\r\n")}`;
    const result = write(content).content;
    expect(result.startsWith("<?xml")).toBe(true);
    expect(result).toContain('<item quantity="one">Il reste %d lingot</item>\r\n        <item quantity="many">');
  });
});
