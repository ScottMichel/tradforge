import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { poWriter } from "../../../../src/formats/apps/po/writer.js";

const translations = new Map([
  ["The Cold Forge", "La forge froide"],
  ["One bar", "Un lingot"],
  ["%d bars", "%d lingots"],
  ["First line\nsecond line", "Première ligne\ndeuxième ligne"],
  ['Say "hello"', "Dites « bonjour »"],
]);

const write = (
  content: string,
  options: Partial<WriterInput["options"]> = {},
  target = "fr",
  translate: WriterInput["translate"] = (source) => translations.get(source),
) =>
  poWriter.write({
    file: "po/forge.pot",
    content,
    translate,
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target },
  });

const header = `# Translations of the forge.
#, fuzzy
msgid ""
msgstr ""
"Project-Id-Version: forge 1.0\\n"
"Language: \\n"
"Content-Type: text/plain; charset=CHARSET\\n"
"Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\\n"
`;

const frenchHeader = `# Translations of the forge.
msgid ""
msgstr ""
"Project-Id-Version: forge 1.0\\n"
"Language: fr\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n > 1);\\n"
`;

describe("poWriter", () => {
  it("writes the translations in the msgstr and leaves every other line as it is", () => {
    const content = `${header}
#. TRANSLATORS: the title of the main window
#: src/window.c:12
#, c-format
msgctxt "window"
msgid "The Cold Forge"
msgstr ""

msgid ""
"First line\\n"
"second line"
msgstr ""

#~ msgid "Old text"
#~ msgstr "Vieux texte"
`;
    const result = write(content);
    expect(result.content).toBe(`${frenchHeader}
#. TRANSLATORS: the title of the main window
#: src/window.c:12
#, c-format
msgctxt "window"
msgid "The Cold Forge"
msgstr "La forge froide"

msgid ""
"First line\\n"
"second line"
msgstr ""
"Première ligne\\n"
"deuxième ligne"

#~ msgid "Old text"
#~ msgstr "Vieux texte"
`);
    expect(result).toMatchObject({ translated: 2, untranslated: 0 });
  });

  it("escapes the translations", () => {
    expect(write('msgid "Say \\"hello\\""\nmsgstr ""\n').content).toContain('msgstr "Dites « bonjour »"');
  });

  it("writes as many plural forms as the target language has, the singular in the form for one", () => {
    const plural = 'msgid "One bar"\nmsgid_plural "%d bars"\nmsgstr[0] ""\nmsgstr[1] ""\n';
    expect(write(plural).content).toContain('msgstr[0] "Un lingot"\nmsgstr[1] "%d lingots"\n');
    expect(write(plural, {}, "ru").content).toContain(
      'msgstr[0] "Un lingot"\nmsgstr[1] "%d lingots"\nmsgstr[2] "%d lingots"\n',
    );
    expect(write(plural, {}, "ja").content).toContain('msgid_plural "%d bars"\nmsgstr[0] "%d lingots"\n');
    expect(write(plural, {}, "ar").content).toMatch(/msgstr\[0\] "%d lingots"\nmsgstr\[1\] "Un lingot"\n/);
    expect(write(plural)).toMatchObject({ translated: 2, untranslated: 0 });
  });

  it("keeps the forms and the plural rule of the catalog for a language it does not know", () => {
    const content = `msgid ""\nmsgstr "Plural-Forms: nplurals=3; plural=(n==1 ? 0 : 1);\\n"\n\nmsgid "One bar"\nmsgid_plural "%d bars"\nmsgstr[0] ""\nmsgstr[1] ""\nmsgstr[2] ""\n`;
    const result = write(content, {}, "tlh").content;
    expect(result).toContain('"Plural-Forms: nplurals=3; plural=(n==1 ? 0 : 1);\\n"');
    expect(result).toContain('msgstr[0] "Un lingot"\nmsgstr[1] "%d lingots"\nmsgstr[2] "%d lingots"\n');
  });

  it("drops the fuzzy flag and the previous text of a translated entry", () => {
    const content =
      '#, fuzzy, c-format\n#| msgid "The Old Forge"\nmsgid "The Cold Forge"\nmsgstr "Old"\n\n#, fuzzy\nmsgid "One bar"\nmsgstr ""\n';
    const result = write(content).content;
    expect(result).toContain(
      '#, c-format\nmsgid "The Cold Forge"\nmsgstr "La forge froide"\n\nmsgid "One bar"\nmsgstr "Un lingot"\n',
    );
  });

  it("leaves an untranslated entry empty, so that programs show the source, or leaves it out", () => {
    const content = 'msgid "Unknown"\nmsgstr "Unknown"\n\nmsgid "The Cold Forge"\nmsgstr ""\n';
    const kept = write(content);
    expect(kept.content).toContain('msgid "Unknown"\nmsgstr ""\n\nmsgid "The Cold Forge"\nmsgstr "La forge froide"\n');
    expect(kept).toMatchObject({ translated: 1, untranslated: 1 });
    expect(write(content, { untranslated: "omit" }).content).not.toContain("Unknown");
    expect(write(content, { untranslated: "omit" }).content).toMatch(
      /^msgid ""\nmsgstr ""\n.*\n\nmsgid "The Cold Forge"/s,
    );
  });

  it("treats a plural entry with a missing translation as untranslated", () => {
    const plural = 'msgid "One bar"\nmsgid_plural "%d coals"\nmsgstr[0] ""\nmsgstr[1] ""\n';
    const result = write(plural);
    expect(result.content).toContain('msgstr[0] ""\nmsgstr[1] ""\n');
    expect(result).toMatchObject({ translated: 0, untranslated: 2 });
  });

  it("adds a header to a catalog without one, so that the accents are read as UTF-8", () => {
    expect(write('msgid "The Cold Forge"\nmsgstr ""\n').content).toBe(
      'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n"Language: fr\\n"\n"Plural-Forms: nplurals=2; plural=(n > 1);\\n"\n\nmsgid "The Cold Forge"\nmsgstr "La forge froide"\n',
    );
  });

  it("keeps CRLF line ends and leaves out the byte order mark", () => {
    const result = write('\u{feff}msgid "First line\\nsecond line"\r\nmsgstr ""\r\n').content;
    expect(result).toContain('msgstr ""\r\n"Première ligne\\n"\r\n"deuxième ligne"\r\n');
    expect(result.startsWith("msgid")).toBe(true);
  });
});
