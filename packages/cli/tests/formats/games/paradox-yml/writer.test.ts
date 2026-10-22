import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { paradoxReader } from "../../../../src/formats/games/paradox-yml/reader.js";
import { encodeParadoxText, paradoxWriter } from "../../../../src/formats/games/paradox-yml/writer.js";

const translations = new Map([
  ["The Cold Forge", "La forge froide"],
  ["The smith of $PROVINCE$ asks for §Ycoal§!.", "Le forgeron de $PROVINCE$ demande du §Ycharbon§!."],
  ['Dear friend,\nHe said "wait".', 'Cher ami,\nIl a dit "attends".'],
  ["Patient Smith", "Forgeron patient"],
]);

const write = (
  content: string,
  options: Partial<WriterInput["options"]> = {},
  target = "fr",
  translate: WriterInput["translate"] = (source) => translations.get(source),
) =>
  paradoxWriter.write({
    file: "localisation/english/forge_l_english.yml",
    content,
    translate,
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target },
  });

const localisation = `l_english:
 # Events of the forge
 forge_event.1.t:0 "The Cold Forge"
 forge_event.1.d:1   "The smith of $PROVINCE$ asks for §Ycoal§!." # colour codes
\tforge_letter: "Dear friend,\\nHe said \\"wait\\"."

 forge_trait:"Patient Smith"#short
 forge_trait_desc:0 "Never hurries."
 forge_empty:0 ""
`;

describe("paradoxWriter", () => {
  it("replaces the translated texts in place and rewrites the header language", () => {
    const result = write(localisation);
    expect(result.content).toBe(`l_french:
 # Events of the forge
 forge_event.1.t:0 "La forge froide"
 forge_event.1.d:1   "Le forgeron de $PROVINCE$ demande du §Ycharbon§!." # colour codes
\tforge_letter: "Cher ami,\\nIl a dit \\"attends\\"."

 forge_trait:"Forgeron patient"#short
 forge_trait_desc:0 "Never hurries."
 forge_empty:0 ""
`);
    expect(result).toMatchObject({ translated: 4, untranslated: 1 });
  });

  it("names the target language as Paradox games do", () => {
    expect(write(localisation, {}, "pt-BR").content).toMatch(/^l_braz_por:\n/);
    expect(write(localisation, {}, "zh-CN").content).toMatch(/^l_simp_chinese:\n/);
  });

  it("rewrites every header and keeps a comment after it", () => {
    const content = 'l_english: # main\n a:0 "The Cold Forge"\nl_english:\n';
    expect(write(content).content).toBe('l_french: # main\n a:0 "La forge froide"\nl_french:\n');
  });

  it("keeps an untranslated entry byte for byte, even with unescaped quotes or odd escapes", () => {
    const content = 'l_english:\n speech:0 "He said "hello"" \n odd:0 "A\\tB"\n';
    const result = write(content);
    expect(result.content).toBe('l_french:\n speech:0 "He said "hello"" \n odd:0 "A\\tB"\n');
    expect(result).toMatchObject({ translated: 0, untranslated: 2 });
  });

  it("leaves out the whole line of an untranslated entry with untranslated: omit", () => {
    const content = 'l_english:\r\n forge_trait: "Patient Smith"\r\n other: "Not yet"\r\n # end\r\n';
    expect(write(content, { untranslated: "omit" }).content).toBe(
      'l_french:\r\n forge_trait: "Forgeron patient"\r\n # end\r\n',
    );
  });

  it("keeps CRLF line ends and drops the byte order mark, which the utf-8-bom encoding adds", () => {
    const content = '\u{feff}l_english:\r\n forge_trait: "Patient Smith"\r\n';
    expect(write(content).content).toBe('l_french:\r\n forge_trait: "Forgeron patient"\r\n');
  });

  it("keeps the source text of keys that are not extracted (blank texts)", () => {
    const content = 'l_english:\n blank: "  "\n';
    expect(write(content, {}, "fr", () => "never")).toMatchObject({
      content: 'l_french:\n blank: "  "\n',
      translated: 0,
      untranslated: 0,
    });
  });

  it("writes a file that the reader reads back as the translations", () => {
    const tricky = 'Back\\slash, \\n literal, "quotes", line\nbreak, # hash, \\t tab';
    const written = write(localisation, {}, "fr", (source) => (source === "Never hurries." ? tricky : undefined));
    const read = paradoxReader.read({ file: "forge_l_french.yml", content: written.content, priority: 0 });
    expect(read.find((o) => o.location.key === "forge_trait_desc")?.source).toBe(tricky);
  });
});

describe("encodeParadoxText", () => {
  it("escapes quotes, line breaks and the backslashes that would start an escape", () => {
    expect(encodeParadoxText('Say "hi"\nnow')).toBe('Say \\"hi\\"\\nnow');
    expect(encodeParadoxText("a\\nb")).toBe("a\\\\nb");
    expect(encodeParadoxText('a\\"')).toBe('a\\\\\\"');
    expect(encodeParadoxText("end\\")).toBe("end\\\\");
    expect(encodeParadoxText("a\\\nb")).toBe("a\\\\\\nb"); // a backslash before a line break
    // Only the first backslash would start an escape: "\\" then "\b", which the reader keeps as it is.
    expect(encodeParadoxText("a\\\\b")).toBe("a\\\\\\b");
  });

  it("keeps other backslashes, markup and non-ASCII characters as they are", () => {
    expect(encodeParadoxText("C:\\path \\t")).toBe("C:\\path \\t");
    expect(encodeParadoxText("§Yé£gold£§! $X$ [Root.GetName] #bold à#!")).toBe(
      "§Yé£gold£§! $X$ [Root.GetName] #bold à#!",
    );
  });

  it("turns CRLF and CR line breaks into \\n", () => {
    expect(encodeParadoxText("a\r\nb\rc")).toBe("a\\nb\\nc");
  });
});
