import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../src/core/writer.js";
import { propertiesReader } from "../../../src/formats/properties/reader.js";
import { encodePropertiesValue, parseProperties } from "../../../src/formats/properties/syntax.js";
import { propertiesWriter } from "../../../src/formats/properties/writer.js";

const file = "src/main/resources/messages.properties";

const bundle = `# Messages of the forge, written for the tests.
! Another comment style

# Title of the main window
app.name = The Cold Forge
welcome=Welcome back, {0}! Don''t let the fire go out.
warning: A long text \\
    on two lines
spaced\\ key   Value after spaces
escapes = Tab\\there\\nNew line \\u00e9t\\u00e9 \\\\ slash
quote = It's plain
empty =
`;

describe("parseProperties", () => {
  it("reads keys and values with every separator, continuation and escape", () => {
    expect(parseProperties(bundle).map((entry) => [entry.key, entry.value])).toEqual([
      ["app.name", "The Cold Forge"],
      ["welcome", "Welcome back, {0}! Don''t let the fire go out."],
      ["warning", "A long text on two lines"],
      ["spaced key", "Value after spaces"],
      ["escapes", "Tab\there\nNew line \u{e9}t\u{e9} \\ slash"],
      ["quote", "It's plain"],
      ["empty", ""],
    ]);
  });

  it("gives the comment above an entry, its line, and the offsets of its value", () => {
    const [name, welcome, warning] = parseProperties(bundle);
    expect(name).toMatchObject({ comment: "Title of the main window", line: 5 });
    expect(welcome?.comment).toBeUndefined();
    expect(bundle.slice(warning?.start, warning?.end)).toBe("A long text \\\n    on two lines");
  });

  it("reads CRLF line ends", () => {
    expect(parseProperties("a=One \\\r\n  two\r\nb=Three\r\n").map((entry) => entry.value)).toEqual([
      "One two",
      "Three",
    ]);
  });

  it("encodes what it decodes", () => {
    const text = " Lead space, tab\there, line\nbreak, back \\ slash";
    expect(parseProperties(`k=${encodePropertiesValue(text, false)}`)[0]?.value).toBe(text);
    expect(encodePropertiesValue("Été 😀", true)).toBe("\\u00c9t\\u00e9 \\ud83d\\ude00");
  });
});

describe("propertiesReader", () => {
  it("reads every non-empty value, with the apostrophes of MessageFormat undoubled", () => {
    const occurrences = propertiesReader.read({ file, content: bundle, priority: 0 });
    expect(occurrences.map((o) => [o.location.key, o.source, o.context])).toEqual([
      ["app.name", "The Cold Forge", "Title of the main window"],
      ["welcome", "Welcome back, {0}! Don't let the fire go out.", undefined],
      ["warning", "A long text on two lines", undefined],
      ["spaced key", "Value after spaces", undefined],
      ["escapes", "Tab\there\nNew line \u{e9}t\u{e9} \\ slash", undefined],
      ["quote", "It's plain", undefined],
    ]);
  });
});

describe("propertiesWriter", () => {
  const write = (content: string, table: Record<string, string>, options: Partial<WriterInput["options"]> = {}) =>
    propertiesWriter.write({
      file,
      content,
      translate: (source) => table[source],
      options: { asciiOnly: false, untranslated: "keep-source", ...options },
      languages: { source: "en", target: "fr" },
    });

  it("replaces each value in place, doubling the apostrophes of MessageFormat texts", () => {
    const result = write(bundle, {
      "The Cold Forge": "La forge froide",
      "Welcome back, {0}! Don't let the fire go out.": "Bon retour, {0} ! Ne laisse pas le feu s'éteindre.",
      "A long text on two lines": "Un long texte\nsur deux lignes",
      "It's plain": "C'est simple",
    });
    expect(result.content).toBe(
      bundle
        .replace("= The Cold Forge", "= La forge froide")
        .replace(
          "=Welcome back, {0}! Don''t let the fire go out.",
          "=Bon retour, {0} ! Ne laisse pas le feu s''éteindre.",
        )
        .replace("A long text \\\n    on two lines", "Un long texte\\nsur deux lignes")
        .replace("= It's plain", "= C'est simple"),
    );
    expect(result).toMatchObject({ translated: 4, untranslated: 2 });
  });

  it("escapes non-ASCII characters with asciiOnly, for Java 8 and older", () => {
    expect(write("a=Summer\n", { Summer: "Été" }, { asciiOnly: true }).content).toBe("a=\\u00c9t\\u00e9\n");
  });

  it("leaves an untranslated entry out with omit, its continuation lines with it", () => {
    const content = "a=Kept\nb=Gone \\\n  still gone\nc=Kept\n";
    expect(write(content, { Kept: "Gardé" }, { untranslated: "omit" }).content).toBe("a=Gardé\nc=Gardé\n");
  });
});
