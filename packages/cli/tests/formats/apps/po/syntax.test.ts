import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import { decodePoString, encodePoString, parsePo } from "../../../../src/formats/apps/po/syntax.js";

const file = "po/forge.pot";

const catalog = `# Translations of the forge.
msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#. TRANSLATORS: the title of the main window
#: src/window.c:12 src/menu.c:40
#, c-format
msgctxt "window"
msgid "The Cold Forge"
msgstr ""

#, fuzzy
#| msgid "One coal"
msgid "One bar"
msgid_plural "%d bars"
msgstr[0] ""
msgstr[1] ""

msgid ""
"First line\\n"
"second line"
msgstr ""

#~ msgid "Old text"
#~ msgstr "Vieux texte"
`;

describe("parsePo", () => {
  it("reads every entry, the header included", () => {
    const entries = parsePo(file, catalog);
    expect(entries.map((entry) => entry.id)).toEqual(["", "The Cold Forge", "One bar", "First line\nsecond line"]);
  });

  it("decodes the strings of each entry, continuation lines included", () => {
    const [header, title, bars, multiline] = parsePo(file, catalog);
    expect(header?.translations.map((t) => t.value)).toEqual([
      "Content-Type: text/plain; charset=UTF-8\nPlural-Forms: nplurals=2; plural=(n != 1);\n",
    ]);
    expect(title).toMatchObject({
      context: "window",
      line: 11,
      comments: ["TRANSLATORS: the title of the main window"],
    });
    expect(title?.flags).toEqual(["c-format"]);
    expect(bars).toMatchObject({ plural: "%d bars", pluralLine: 17, flags: ["fuzzy"] });
    expect(bars?.translations.map((t) => t.index)).toEqual([0, 1]);
    expect(multiline?.line).toBe(21);
    expect(title?.translations.map((t) => t.index)).toEqual([undefined]);
  });

  it("gives the offsets of the translations, of the flags and of the whole entry", () => {
    const [, title, bars] = parsePo(file, catalog);
    const translations = (entry: typeof title) =>
      entry === undefined ? "" : catalog.slice(entry.translationStart, entry.translationEnd);
    expect(translations(title)).toBe('msgstr ""');
    expect(translations(bars)).toBe('msgstr[0] ""\nmsgstr[1] ""');
    expect(catalog.slice(title?.start, title?.end)).toMatch(/^#\. TRANSLATORS.*msgstr ""$/s);
    const lines = bars?.commentLines.map((line) => [line.kind, catalog.slice(line.start, line.next)]);
    expect(lines).toEqual([
      [",", "#, fuzzy\n"],
      ["|", '#| msgid "One coal"\n'],
    ]);
  });

  it("keeps obsolete entries out: they are comments", () => {
    expect(parsePo(file, '#~ msgid "Old"\n#~ msgstr "Vieux"\n')).toEqual([]);
  });

  it("does not attach a comment separated by a blank line", () => {
    const [entry] = parsePo(file, '#. stray note\n\nmsgid "Hello"\nmsgstr ""\n');
    expect(entry?.comments).toEqual([]);
  });

  it("reads files with CRLF line ends and a byte order mark", () => {
    const [entry] = parsePo(file, '\u{feff}msgid "Hello"\r\nmsgstr ""\r\n');
    expect(entry).toMatchObject({ id: "Hello", line: 1 });
  });

  it("reads entries that follow each other without a blank line", () => {
    const entries = parsePo(file, 'msgid "A"\nmsgstr ""\nmsgid "B"\nmsgstr ""\n');
    expect(entries.map((entry) => entry.id)).toEqual(["A", "B"]);
  });

  it("names the file and the line of a broken entry", () => {
    expect(() => parsePo(file, 'msgid "A"\nmsgstr ""\nhello\n')).toThrow(
      new ReadError(file, "line 3: unexpected line"),
    );
    expect(() => parsePo(file, 'msgid "A"\n\nmsgid "B"\nmsgstr ""\n')).toThrow(/line 1: msgid without msgstr/);
    expect(() => parsePo(file, 'msgid "A\nmsgstr ""\n')).toThrow(/line 1: unterminated string/);
    expect(() => parsePo(file, 'msgstr ""\n')).toThrow(/line 1: msgstr without msgid/);
  });
});

describe("decodePoString / encodePoString", () => {
  it("decodes the C escapes of gettext", () => {
    expect(decodePoString(String.raw`Tab\there, quote \" and \\ back\nslash \101\x42`)).toBe(
      'Tab\there, quote " and \\ back\nslash AB',
    );
  });

  it("writes a one-line string, or one line per line break", () => {
    expect(encodePoString("msgstr", 'Il a dit "non"', "\n")).toBe(String.raw`msgstr "Il a dit \"non\""`);
    expect(encodePoString("msgstr", "Line\n", "\n")).toBe(String.raw`msgstr "Line\n"`);
    expect(encodePoString("msgstr[1]", "Un\ndeux\n", "\r\n")).toBe(`msgstr[1] ""\r\n"Un\\n"\r\n"deux\\n"`);
  });

  it("encodes what it decodes", () => {
    const text = 'A\ttab, a "quote", a \\ and a\rreturn';
    const encoded = encodePoString("msgstr", text, "\n");
    expect(decodePoString(encoded.slice('msgstr "'.length, -1))).toBe(text);
  });
});
