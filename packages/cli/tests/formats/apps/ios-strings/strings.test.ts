import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import type { WriterInput } from "../../../../src/core/writer.js";
import { iosStringsReader } from "../../../../src/formats/apps/ios-strings/reader.js";
import { encodeIosString, parseIosStrings } from "../../../../src/formats/apps/ios-strings/strings.js";
import { iosStringsWriter } from "../../../../src/formats/apps/ios-strings/writer.js";

const file = "App/en.lproj/Localizable.strings";

const strings = `/* Localizable strings of the forge, written for the tests. */

/* Title of the main window */
"app_name" = "The Cold Forge";

/* No comment provided by engineer. */
"welcome" = "Welcome back, %@!\\nThe fire is \\"still\\" burning.";
// A line comment
greeting_key   =   "Hello \\U00E9t\\U00E9";
"bars" = "%ld bars left"; "empty" = "";
`;

describe("parseIosStrings", () => {
  it("reads every entry, its comment, and decodes its escapes", () => {
    expect(parseIosStrings(file, strings).map((entry) => [entry.key, entry.value, entry.comment])).toEqual([
      ["app_name", "The Cold Forge", "Title of the main window"],
      ["welcome", 'Welcome back, %@!\nThe fire is "still" burning.', undefined],
      ["greeting_key", "Hello \u{e9}t\u{e9}", "A line comment"],
      ["bars", "%ld bars left", undefined],
      ["empty", "", undefined],
    ]);
  });

  it("gives the offsets of each value and its line", () => {
    const [first] = parseIosStrings(file, strings);
    expect(first?.line).toBe(4);
    expect(strings.slice(first?.start, first?.end)).toBe('"The Cold Forge"');
  });

  it("names the file and the line of what it cannot read", () => {
    expect(() => parseIosStrings(file, '"a" = "b"\n"c" = "d";')).toThrow(new ReadError(file, 'line 2: expected ";"'));
    expect(() => parseIosStrings(file, '"a" = "open;\n')).toThrow(/line 1: unterminated string/);
    expect(() => parseIosStrings(file, "/* open")).toThrow(/line 1: unterminated comment/);
    expect(() => parseIosStrings(file, '"a" "b";')).toThrow(/line 1: expected "="/);
  });

  it("encodes what it decodes", () => {
    const text = 'Quote " back \\ line\nbreak\ttab';
    const encoded = encodeIosString(text, false);
    expect(parseIosStrings(file, `"k" = ${encoded};`)[0]?.value).toBe(text);
    expect(encodeIosString("Été 😀", true)).toBe('"\\U00C9t\\U00E9 \\UD83D\\UDE00"');
  });
});

describe("iosStringsReader", () => {
  it("reads every non-empty value, the comment of the developer as context", () => {
    const occurrences = iosStringsReader.read({ file, content: strings, priority: 0, context: "a game" });
    expect(occurrences.map((o) => [o.location.key, o.source, o.context])).toEqual([
      ["app_name", "The Cold Forge", "a game | Title of the main window"],
      ["welcome", 'Welcome back, %@!\nThe fire is "still" burning.', "a game"],
      ["greeting_key", "Hello \u{e9}t\u{e9}", "a game | A line comment"],
      ["bars", "%ld bars left", "a game"],
    ]);
  });
});

describe("iosStringsWriter", () => {
  const write = (content: string, table: Record<string, string>, options: Partial<WriterInput["options"]> = {}) =>
    iosStringsWriter.write({
      file,
      content,
      translate: (source) => table[source],
      options: { asciiOnly: false, untranslated: "keep-source", ...options },
      languages: { source: "en", target: "fr" },
    });

  it("replaces each translated value in place, comments and keys untouched", () => {
    const result = write(strings, {
      "The Cold Forge": "La forge froide",
      'Welcome back, %@!\nThe fire is "still" burning.': 'Bon retour, %@ !\nLe feu brûle "encore".',
      "%ld bars left": "Il reste %ld lingots",
    });
    expect(result.content).toBe(
      strings
        .replace('"The Cold Forge"', '"La forge froide"')
        .replace(
          '"Welcome back, %@!\\nThe fire is \\"still\\" burning."',
          '"Bon retour, %@ !\\nLe feu brûle \\"encore\\"."',
        )
        .replace('"%ld bars left"', '"Il reste %ld lingots"'),
    );
    expect(result).toMatchObject({ translated: 3, untranslated: 1 });
  });

  it("leaves an untranslated entry out with omit, its comment with it", () => {
    const content = '/* Title */\n"a" = "Kept";\n\n/* Gone */\n"b" = "Gone";\n"c" = "Kept";\n';
    expect(write(content, { Kept: "Gardé" }, { untranslated: "omit" }).content).toBe(
      '/* Title */\n"a" = "Gardé";\n\n"c" = "Gardé";\n',
    );
  });

  it("escapes every character outside ASCII with asciiOnly, and keeps CRLF", () => {
    const content = '"a" = "Summer";\r\n"b" = "Winter";\r\n';
    expect(write(content, { Summer: "Été" }, { asciiOnly: true }).content).toBe(
      '"a" = "\\U00C9t\\U00E9";\r\n"b" = "Winter";\r\n',
    );
  });
});
