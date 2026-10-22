import { describe, expect, it } from "vitest";
import { type LogicalLine, logicalLines, RenpySyntaxError, type Token } from "../../../src/formats/renpy/lexer.js";

/** A readable form of the tokens: strings in quotes as written, words and punctuation as they are. */
function describeTokens(line: LogicalLine | undefined): string[] {
  return (line?.tokens ?? []).map((token: Token) =>
    token.kind === "string" ? `${token.literal.prefix}<${token.literal.body}>` : token.text,
  );
}

describe("logicalLines", () => {
  it("splits the source into logical lines with their indentation and 1-based line", () => {
    const lines = logicalLines('label start:\n    e "Hello."\n\n    # a comment\n    return\n');
    expect(lines.map(({ line, indent }) => ({ line, indent }))).toEqual([
      { line: 1, indent: 0 },
      { line: 2, indent: 4 },
      { line: 5, indent: 4 },
    ]);
    expect(describeTokens(lines[0])).toEqual(["label", "start", ":"]);
    expect(describeTokens(lines[1])).toEqual(["e", "<Hello.>"]);
  });

  it("keeps the exact position of each string literal, delimiters and prefix included", () => {
    const source = 'e r"raw" \'single\' """triple"""';
    const strings = (logicalLines(source)[0]?.tokens ?? []).flatMap((token) =>
      token.kind === "string" ? [token.literal] : [],
    );
    expect(strings.map((s) => source.slice(s.start, s.end))).toEqual(['r"raw"', "'single'", '"""triple"""']);
    expect(strings.map((s) => [s.quote, s.triple])).toEqual([
      ['"', false],
      ["'", false],
      ['"', true],
    ]);
  });

  it("ignores comments, but not a # inside a string", () => {
    const lines = logicalLines('e "{color=#f00}Red{/color}" # not "this"\n');
    expect(describeTokens(lines[0])).toEqual(["e", "<{color=#f00}Red{/color}>"]);
  });

  it("joins the physical lines of open parentheses, open strings and backslash continuations", () => {
    const lines = logicalLines('$ x = f(\n    "a",\n    "b")\ne "One\n  two"\n$ y = 1 + \\\n    2\nreturn\n');
    expect(lines.map((l) => l.line)).toEqual([1, 4, 6, 8]);
    expect(describeTokens(lines[1])).toEqual(["e", "<One\n  two>"]);
  });

  it("reads escaped quotes and triple strings containing quotes and line breaks", () => {
    const lines = logicalLines('e "Say \\"hi\\"."\n"""He said "no".\n\nThen left."""\n');
    expect(describeTokens(lines[0])).toEqual(["e", '<Say \\"hi\\".>']);
    expect(describeTokens(lines[1])).toEqual(['<He said "no".\n\nThen left.>']);
    expect(lines[1]?.line).toBe(2);
  });

  it("reads dotted names as one word and handles Windows line breaks", () => {
    const lines = logicalLines('label start.part:\r\n    $ renpy.pause(1.0)\r\n    e "Hi"\r\n');
    expect(describeTokens(lines[0])).toEqual(["label", "start.part", ":"]);
    expect(describeTokens(lines[1])).toEqual(["$", "renpy.pause", "(", "1.0", ")"]);
    expect(lines[2]?.line).toBe(3);
  });

  it("ignores a byte order mark", () => {
    expect(describeTokens(logicalLines('\u{feff}e "Hi"')[0])).toEqual(["e", "<Hi>"]);
  });

  it.each([
    ['e "never closed\n', 1],
    ['label a:\n    e """never closed\n\n', 2],
    ["$ x = f(1,\n", 1],
  ])("throws a syntax error with the line for %j", (source, line) => {
    expect(() => logicalLines(source)).toThrow(RenpySyntaxError);
    expect(() => logicalLines(source)).toThrow(`line ${line}:`);
  });
});
