import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import { parseYaml, type YamlScalar } from "../../../src/formats/yaml/syntax.js";

const file = "config/locales/en.yml";
const values = (content: string) =>
  parseYaml(file, content).scalars.map((scalar) => [scalar.path.join("."), scalar.value, scalar.isText]);

describe("parseYaml", () => {
  it("reads nested mappings, with the path of every value", () => {
    const content = `# Texts of the forge
en:
  title: The Cold Forge
  menu:
    quit:   Quit the game   # a comment
    "load game": 'Load a game'
`;
    expect(values(content)).toEqual([
      ["en.title", "The Cold Forge", true],
      ["en.menu.quit", "Quit the game", true],
      ["en.menu.load game", "Load a game", true],
    ]);
  });

  it("tells texts from other values, as YAML 1.1 reads them", () => {
    const content = 'a: true\nb: No\nc: ~\nd: 42\ne: 3.5e2\nf: 2024-01-01\ng: "No"\nh: Nope\ni: 0x1F\nj:\n';
    expect(values(content).map(([path, , isText]) => `${path}=${isText}`)).toEqual([
      "a=false",
      "b=false",
      "c=false",
      "d=false",
      "e=false",
      "f=false",
      "g=true",
      "h=true",
      "i=false",
    ]);
  });

  it("decodes quoted strings", () => {
    const content = String.raw`a: "Tab\tquote\" back\\slash \u00e9 \x41 line\nend"
b: 'It''s here'
c: "#not a comment" # but this is
`;
    expect(values(content)).toEqual([
      ["a", 'Tab\tquote" back\\slash \u{e9} A line\nend', true],
      ["b", "It's here", true],
      ["c", "#not a comment", true],
    ]);
  });

  it("reads block scalars, literal and folded, with their chomping", () => {
    const content = `literal: |
  First line
    indented
  Last line
strip: |-
  No final break

folded: >
  Folded
  lines

  New paragraph
keep: |+
  Kept

next: done
`;
    expect(values(content)).toEqual([
      ["literal", "First line\n  indented\nLast line\n", true],
      ["strip", "No final break", true],
      ["folded", "Folded lines\nNew paragraph\n", true],
      ["keep", "Kept\n\n", true],
      ["next", "done", true],
    ]);
  });

  it("reads strings that go on over several lines", () => {
    const content = `plain: A long text
  that goes on
quoted: "Another long
  text"
`;
    expect(values(content)).toEqual([
      ["plain", "A long text that goes on", true],
      ["quoted", "Another long text", true],
    ]);
  });

  it("reads lists, block and flow, and mappings inside lists", () => {
    const content = `days: [Sunday, "Monday", 'Tuesday']
months:
  - January
  - "February"
steps:
- title: Light the fire
  hint: Use coal
-   Plain step
`;
    expect(values(content)).toEqual([
      ["days.0", "Sunday", true],
      ["days.1", "Monday", true],
      ["days.2", "Tuesday", true],
      ["months.0", "January", true],
      ["months.1", "February", true],
      ["steps.0.title", "Light the fire", true],
      ["steps.0.hint", "Use coal", true],
      ["steps.1", "Plain step", true],
    ]);
  });

  it("gives the offsets, the line and the style of each value", () => {
    const content = 'a:\n  b: "Hello"\n  c: |\n    Block\n    text\n';
    const [b, c] = parseYaml(file, content).scalars as [YamlScalar, YamlScalar];
    expect(b).toMatchObject({ style: "double", line: 2, indent: 2 });
    expect(content.slice(b.start, b.end)).toBe('"Hello"');
    expect(c).toMatchObject({ style: "literal", line: 3, header: "|", contentIndent: 4 });
    expect(content.slice(c.start, c.end)).toBe("|\n    Block\n    text");
    expect(content.slice(b.entryStart, b.entryEnd)).toBe('  b: "Hello"\n');
  });

  it("lets only a value alone on its lines be left out: not a list item, not the key above it", () => {
    const content = "menu:\n  quit: Quit\ndays: [Sunday]\n";
    const [quit, sunday] = parseYaml(file, content).scalars as [YamlScalar, YamlScalar];
    expect(quit.removable).toBe(true);
    expect(content.slice(quit.entryStart, quit.entryEnd)).toBe("  quit: Quit\n");
    expect(sunday.removable).toBe(false);
  });

  it("finds the language key at the root of a Rails file", () => {
    const content = "\u{feff}---\nen:\n  title: The Cold Forge\n";
    const document = parseYaml(file, content, "en");
    const text = content.slice(1);
    expect(document.languageKey).toMatchObject({ value: "en" });
    expect(text.slice(document.languageKey?.start, document.languageKey?.end)).toBe("en");
    expect(parseYaml(file, "en:\n  a: b\nfr:\n  a: b\n", "en").languageKey).toBeUndefined();
  });

  it("reads CRLF line ends", () => {
    expect(values("a: one\r\nb: |\r\n  two\r\n  lines\r\n")).toEqual([
      ["a", "one", true],
      ["b", "two\nlines\n", true],
    ]);
  });

  it("names the file and the line of what it cannot read", () => {
    expect(() => parseYaml(file, "base: &base\n  a: b\n")).toThrow(
      new ReadError(file, "line 1: anchors, aliases and tags are not supported"),
    );
    expect(() => parseYaml(file, "a: *base\n")).toThrow(/line 1: anchors, aliases and tags/);
    expect(() => parseYaml(file, "a: {b: c}\n")).toThrow(/line 1: flow mappings are not supported/);
    expect(() => parseYaml(file, 'a: "open\n')).toThrow(/line 1: unterminated string/);
    expect(() => parseYaml(file, "a: b\n  c: d\n")).toThrow(/line 2: unexpected indentation/);
    expect(() => parseYaml(file, "a: b\njust text\n")).toThrow(/line 2: expected "key: value"/);
    expect(() => parseYaml(file, "a:\n\tb: c\n")).toThrow(/line 2: tabs cannot indent YAML/);
  });

  it("accepts an empty file, comments only, and an empty flow mapping", () => {
    expect(values("")).toEqual([]);
    expect(values("# nothing\n---\n")).toEqual([]);
    expect(values("a: {}\nb: []\n")).toEqual([]);
  });
});
