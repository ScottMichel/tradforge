import { describe, expect, it } from "vitest";
import {
  decodePythonString,
  decodeRenpyString,
  encodePythonString,
  encodeRenpyString,
  encodeRenpyTriple,
  splitMonologue,
} from "../../../../src/formats/games/renpy/strings.js";

describe("decodeRenpyString", () => {
  it.each([
    ["Hello there.", "Hello there."],
    ['Say \\"hi\\".', 'Say "hi".'],
    ["back\\\\slash", "back\\slash"],
    ["one\\ntwo", "one\ntwo"],
    ["\\t is not a tab", "t is not a tab"],
    ["café \\u00e9", "café é"],
    ["\\u41BC", "\u{41bc}"],
    ["\\{b} is not a tag", "{{b} is not a tag"],
    ["\\[name] is not a variable", "[[name] is not a variable"],
    ["100\\%", "100%%"],
    ["{{ and [[ stay doubled", "{{ and [[ stay doubled"],
    ["many    spaces", "many spaces"],
    ["across\n    two lines", "across two lines"],
    ["kept\\ \\ spaces", "kept  spaces"],
    ["{b}Bold{/b} and [player]", "{b}Bold{/b} and [player]"],
  ])("decodes %j", (body, value) => {
    expect(decodeRenpyString(body, false)).toBe(value);
  });

  it("keeps a raw string as it is", () => {
    expect(decodeRenpyString("a\\nb  c", true)).toBe("a\\nb  c");
  });
});

describe("splitMonologue", () => {
  it("splits a triple-quoted string into paragraphs on blank lines", () => {
    const body = "\n    First line\n    of the first.\n\n    The second.\n\n\n    The third.\n";
    expect(splitMonologue(body, "double")).toEqual([
      { value: "First line of the first.", lineOffset: 1 },
      { value: "The second.", lineOffset: 4 },
      { value: "The third.", lineOffset: 7 },
    ]);
  });

  it("splits on every line break in single mode", () => {
    expect(splitMonologue("One.\nTwo.\n\nThree.", "single").map((p) => p.value)).toEqual(["One.", "Two.", "Three."]);
  });

  it("keeps the line breaks and one paragraph in none mode", () => {
    expect(splitMonologue("  One  line.\n  Two.  ", "none")).toEqual([{ value: "One line.\nTwo.", lineOffset: 0 }]);
  });

  it("applies escapes inside each paragraph", () => {
    expect(splitMonologue('Say \\"hi\\"\\nnow.\n\n\\{b}', "double").map((p) => p.value)).toEqual([
      'Say "hi"\nnow.',
      "{{b}",
    ]);
  });
});

describe("encodeRenpyString", () => {
  it.each([
    ["plain", '"'],
    ['quote " and \\ backslash', '"'],
    ["it's", "'"],
    ["two\nlines", '"'],
    ["double  spaces   kept", '"'],
    [" leading and trailing ", '"'],
    ["{b}tag{/b} [name] {{ [[ %%", '"'],
    ["Été", '"'],
  ] as const)("round-trips %j", (value, quote) => {
    const literal = encodeRenpyString(value, quote, false);
    expect(literal.startsWith(quote) && literal.endsWith(quote)).toBe(true);
    expect(decodeRenpyString(literal.slice(1, -1), false)).toBe(value);
  });

  it("escapes non-ASCII characters of the basic plane when asked to", () => {
    expect(encodeRenpyString("Été à", '"', true)).toBe('"\\u00c9t\\u00e9 \\u00e0"');
    expect(decodeRenpyString("\\u00c9t\\u00e9 \\u00e0", false)).toBe("Été à");
  });
});

describe("encodeRenpyTriple", () => {
  it.each(["double", "single", "none"] as const)("round-trips paragraphs in %s mode", (mode) => {
    const paragraphs =
      mode === "none" ? ['One "quoted"\nline.'] : ['One "quoted" line.', " Two  spaced ", 'ends with "'];
    const literal = encodeRenpyTriple(paragraphs, '"', false, "\n", mode);
    expect(literal.startsWith('"""') && literal.endsWith('"""')).toBe(true);
    expect(splitMonologue(literal.slice(3, -3), mode).map((p) => p.value)).toEqual(paragraphs);
  });
});

describe("decodePythonString", () => {
  it.each([
    ["", "Hello", "Hello"],
    ["", "tab\\there", "tab\there"],
    ["", 'it\\\'s \\"ok\\"', 'it\'s "ok"'],
    ["", "\\x41\\101\\u00e9\\U0001F600", "AAé\u{1f600}"],
    ["", "line\\\ncontinued", "linecontinued"],
    ["", "unknown \\q stays", "unknown \\q stays"],
    ["", "  spaces  kept  ", "  spaces  kept  "],
    ["u", "unicode", "unicode"],
    ["r", "raw\\n", "raw\\n"],
    ["R", "raw\\t", "raw\\t"],
  ])("decodes %j %j", (prefix, body, value) => {
    expect(decodePythonString(prefix, body)).toBe(value);
  });

  it.each([
    ["f", "{x}"],
    ["b", "bytes"],
    ["rb", "bytes"],
    ["", "\\N{BULLET}"],
  ])("refuses what is not a plain text (%j %j)", (prefix, body) => {
    expect(decodePythonString(prefix, body)).toBeUndefined();
  });
});

describe("encodePythonString", () => {
  it.each([
    ["plain", '"', false],
    ["quote \" ' and \\", '"', false],
    ["quote \" ' and \\", "'", false],
    ["tab\tline\nreturn\r bell\x07", '"', false],
    ["Été 😀", '"', true],
  ] as const)("round-trips %j", (value, quote, asciiOnly) => {
    const literal = encodePythonString(value, quote, asciiOnly);
    expect(decodePythonString("", literal.slice(1, -1))).toBe(value);
    if (asciiOnly) expect([...literal].every((char) => (char.codePointAt(0) ?? 0) <= 0x7f)).toBe(true);
  });
});
