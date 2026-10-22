import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import { groupKey, paradoxReader } from "../../../src/formats/paradox/reader.js";

const file = "localisation/english/forge_events_l_english.yml";
const read = (content: string) => paradoxReader.read({ file, content, priority: 1 });
const sources = (content: string) => read(content).map((o) => [o.location.key, o.source]);

const localisation = `l_english:
 # Events of the forge
 forge_event.1.t:0 "The Cold Forge"
 forge_event.1.d:1 "The smith of $PROVINCE$ asks for §Ycoal§!."
 forge_event.1.a: "Buy coal (£gold£ 10)"

 forge_trait: "Patient Smith" # shown in the trait list
 forge_trait_desc:0 "[Root.GetName] never hurries."
`;

describe("paradoxReader", () => {
  it("reads one text per entry, keyed by the localisation key", () => {
    expect(sources(localisation)).toEqual([
      ["forge_event.1.t", "The Cold Forge"],
      ["forge_event.1.d", "The smith of $PROVINCE$ asks for §Ycoal§!."],
      ["forge_event.1.a", "Buy coal (£gold£ 10)"],
      ["forge_trait", "Patient Smith"],
      ["forge_trait_desc", "[Root.GetName] never hurries."],
    ]);
  });

  it("records the file, key, line, priority and context of every occurrence", () => {
    const [occurrence] = paradoxReader.read({
      file,
      content: 'l_english:\n my_key:0 "Good night"\n',
      priority: 3,
      context: "event text",
    });
    expect(occurrence).toStrictEqual({
      source: "Good night",
      location: { file, key: "my_key", line: 2 },
      priority: 3,
      context: "event text",
      group: `${file}#my_key`,
    });
  });

  it("groups the texts of one event (same key up to the last dot) and a name with its description", () => {
    expect(read(localisation).map((o) => o.group)).toEqual([
      `${file}#forge_event.1`,
      `${file}#forge_event.1`,
      `${file}#forge_event.1`,
      `${file}#forge_trait`,
      `${file}#forge_trait`,
    ]);
  });

  it("derives the group key from the event prefix or a known suffix", () => {
    expect(groupKey("my_event.12.desc")).toBe("my_event.12");
    expect(groupKey("decision_build_well_tooltip")).toBe("decision_build_well");
    expect(groupKey("TAG_ADJ")).toBe("TAG");
    expect(groupKey("lonely_key")).toBe("lonely_key");
    expect(groupKey("_desc")).toBe("_desc");
    expect(groupKey(".hidden")).toBe(".hidden");
  });

  it("strips the byte order mark and accepts CRLF line ends", () => {
    const content = `\u{feff}l_english:\r\n key_a:0 "First"\r\n key_b: "Second"\r\n`;
    expect(read(content).map((o) => [o.location.line, o.source])).toEqual([
      [2, "First"],
      [3, "Second"],
    ]);
  });

  it("accepts entries without indentation, with tabs, or with spaces around the version", () => {
    const content = 'l_english:\nno_indent:0 "One"\n\ttabbed:0 "Two"\n   spaced:12   "Three"\n compact:"Four"\n';
    expect(sources(content)).toEqual([
      ["no_indent", "One"],
      ["tabbed", "Two"],
      ["spaced", "Three"],
      ["compact", "Four"],
    ]);
  });

  it('decodes \\n into a line break, \\" into a quote and \\\\ into a backslash', () => {
    const content = 'l_english:\n letter:0 "Dear friend,\\n\\nHe said \\"wait\\".\\\\o/"\n';
    expect(read(content)[0]?.source).toBe('Dear friend,\n\nHe said "wait".\\o/');
  });

  it("keeps other backslash sequences as they are", () => {
    const content = 'l_english:\n odd:0 "A\\tB and C:\\path"\n';
    expect(read(content)[0]?.source).toBe("A\\tB and C:\\path");
  });

  it("accepts unescaped quotes inside a text: the closing quote is the last one of the line", () => {
    const content = 'l_english:\n speech:0 "He said "hello" twice" # comment\n';
    expect(read(content)[0]?.source).toBe('He said "hello" twice');
  });

  it("keeps # and markup inside the quotes: only a # after the closing quote starts a comment", () => {
    const content = 'l_english:\n styled:0 "#bold Strong#! words, issue #3, @gold_icon! and [GetDateText]"  # note\n';
    expect(read(content)[0]?.source).toBe("#bold Strong#! words, issue #3, @gold_icon! and [GetDateText]");
  });

  it("skips comments, blank lines and empty or blank texts", () => {
    const content = '# file comment\n\nl_english:\n  # indented comment\n empty:0 ""\n blank:0 "   "\n kept:0 "Kept"\n';
    expect(sources(content)).toEqual([["kept", "Kept"]]);
  });

  it("accepts a comment after the header and several language blocks", () => {
    const content = 'l_english: # main\n a:0 "One"\nl_english:\n b:0 "Two"\n';
    expect(sources(content)).toEqual([
      ["a", "One"],
      ["b", "Two"],
    ]);
  });

  it("returns nothing for a file with only a header", () => {
    expect(read("l_english:\n")).toEqual([]);
  });

  it("throws a ReadError naming the file and the line for a missing header", () => {
    expect(() => read('# comment\n my_key:0 "Text"\n')).toThrow(ReadError);
    expect(() => read('# comment\n my_key:0 "Text"\n')).toThrow(`${file}: line 2: missing header (e.g. "l_english:")`);
    expect(() => read("")).toThrow(`${file}: line 1: missing header (e.g. "l_english:")`);
  });

  it("throws a ReadError for an unterminated quote", () => {
    expect(() => read('l_english:\n good:0 "Fine"\n bad:0 "No end\n')).toThrow(
      `${file}: line 3: unterminated quote in "bad"`,
    );
  });

  it("throws a ReadError for text after the closing quote", () => {
    expect(() => read('l_english:\n bad:0 "Text" extra\n')).toThrow(
      `${file}: line 2: unexpected text after the closing quote of "bad"`,
    );
  });

  it("throws a ReadError for a line that is not an entry", () => {
    expect(() => read("l_english:\n just some words\n")).toThrow(`${file}: line 2: expected 'key:0 "text"'`);
    expect(() => read("l_english:\n no_value:0\n")).toThrow(`${file}: line 2: expected 'key:0 "text"'`);
  });
});
