import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import { xliffReader } from "../../../../src/formats/apps/xliff/reader.js";
import { xliff12, xliff20 } from "./fixtures.js";

const file = "src/locale/messages.xlf";
const read = (content: string, context?: string) =>
  xliffReader.read({ file, content, priority: 1, ...(context !== undefined ? { context } : {}) });

describe("xliffReader", () => {
  it("reads the source of every trans-unit of XLIFF 1.2, inline tags as they are written", () => {
    expect(read(xliff12).map((occurrence) => occurrence.source)).toEqual([
      "The Cold Forge",
      'Welcome back, <x id="INTERPOLATION" equiv-text="{{ name }}"/>! Fish & chips?',
      'Press <g id="1" ctype="bold">Quit</g> to leave <now>',
    ]);
  });

  it("gives the id as key, the notes as context, and the group of the unit", () => {
    const [title, , quit] = read(xliff12, "a game about smiths");
    expect(title).toStrictEqual({
      source: "The Cold Forge",
      location: { file, key: "title", line: 6 },
      priority: 1,
      context: "a game about smiths | Title of the main window",
    });
    expect(quit).toMatchObject({ location: { key: "quit" }, group: `${file}#menu` });
    expect(title?.group).toBeUndefined();
  });

  it("reads every segment of XLIFF 2, one group per unit of several segments", () => {
    const occurrences = read(xliff20);
    expect(occurrences.map((occurrence) => [occurrence.location.key, occurrence.source])).toEqual([
      ["title", "The Cold Forge"],
      ["story/s1", "The fire is out."],
      ["story/s2", 'Light it with <pc id="1">the <ph id="2" disp="{tool}"/></pc>.'],
    ]);
    expect(occurrences[0]?.context).toBe("Title of the main window");
    expect(occurrences[1]?.group).toBe(`${file}#story`);
    expect(occurrences[2]?.group).toBe(`${file}#story`);
  });

  it("names the file of a document that is not XLIFF, or not well formed", () => {
    expect(() => read("<resources/>")).toThrow(new ReadError(file, "not an XLIFF document (its root is <resources>)"));
    expect(() => read('<xliff version="3.0"/>')).toThrow(/unsupported XLIFF version 3.0/);
    expect(() => read('<xliff version="1.2"><file>')).toThrow(/unclosed element <file>/);
  });
});
