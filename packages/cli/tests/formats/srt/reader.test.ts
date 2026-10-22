import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import { srtReader } from "../../../src/formats/srt/reader.js";

const file = "videos/intro.en.srt";
const read = (content: string) => srtReader.read({ file, content, priority: 2 });
const texts = (content: string) => read(content).map((o) => [o.location.key, o.source]);

const subtitles = `1
00:00:01,000 --> 00:00:02,500
Where did you leave the lantern?

2
00:00:03,000 --> 00:00:05,000
On the shelf,
next to the old map.

3
00:00:09,000 --> 00:00:10,000
<i>Later that night...</i>
`;

describe("srtReader", () => {
  it("reads one occurrence per cue, with its lines joined by a line feed", () => {
    expect(texts(subtitles)).toEqual([
      ["1", "Where did you leave the lantern?"],
      ["2", "On the shelf,\nnext to the old map."],
      ["3", "<i>Later that night...</i>"],
    ]);
  });

  it("records the file, cue number, line, priority and context of every occurrence", () => {
    const [occurrence] = srtReader.read({ file, content: subtitles, priority: 2, context: "film subtitles" });
    expect(occurrence).toStrictEqual({
      source: "Where did you leave the lantern?",
      location: { file, key: "1", line: 3 },
      priority: 2,
      context: "film subtitles",
      group: `${file}#1`,
    });
  });

  it("puts cues less than two seconds apart in the same group, and starts a new one after a pause", () => {
    // 2.5 s → 3 s: 0.5 s gap, same scene. 5 s → 9 s: 4 s pause, new scene.
    expect(read(subtitles).map((o) => o.group)).toEqual([`${file}#1`, `${file}#1`, `${file}#3`]);
  });

  it("keeps overlapping cues in the same group", () => {
    const content = "1\n00:00:01,000 --> 00:00:04,000\nFirst voice\n\n2\n00:00:02,000 --> 00:00:03,000\nSecond voice\n";
    expect(read(content).map((o) => o.group)).toEqual([`${file}#1`, `${file}#1`]);
  });

  it("accepts CRLF line endings, a byte order mark and a missing final line break", () => {
    const content =
      "\u{feff}1\r\n00:00:01,000 --> 00:00:02,000\r\nGood morning\r\nto you\r\n\r\n2\r\n00:00:02,100 --> 00:00:03,000\r\nThanks";
    expect(texts(content)).toEqual([
      ["1", "Good morning\nto you"],
      ["2", "Thanks"],
    ]);
  });

  it("accepts extra blank lines, cue numbers out of order, and a dot before the milliseconds", () => {
    const content = "\n\n7\n00:00:01.000 --> 00:00:02.000\nOne\n\n\n\n3\n00:00:03,000 --> 00:00:04,000\nTwo\n\n\n";
    expect(texts(content)).toEqual([
      ["7", "One"],
      ["3", "Two"],
    ]);
  });

  it("finds the next cue even when the blank line before it is missing", () => {
    const content = "1\n00:00:01,000 --> 00:00:02,000\nOne\n2\n00:00:03,000 --> 00:00:04,000\nTwo\n";
    expect(texts(content)).toEqual([
      ["1", "One"],
      ["2", "Two"],
    ]);
  });

  it("uses the position of the cue as its key when the number is missing", () => {
    const content = "00:00:01,000 --> 00:00:02,000\nNo number here\n";
    expect(read(content)[0]?.location).toStrictEqual({ file, key: "1", line: 2 });
  });

  it("removes the spaces at the end of the lines", () => {
    const content = "1\n00:00:01,000 --> 00:00:02,000\nTrailing spaces   \nand a tab\t\n";
    expect(texts(content)).toEqual([["1", "Trailing spaces\nand a tab"]]);
  });

  it("skips empty cues and cues without any letter (music notes, dots)", () => {
    const content =
      "1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:02,000 --> 00:00:03,000\n♪ ♪\n\n3\n00:00:03,000 --> 00:00:04,000\n<i>...</i>\n\n4\n00:00:04,000 --> 00:00:05,000\n{\\an8}Up here\n";
    expect(texts(content)).toEqual([["4", "{\\an8}Up here"]]);
  });

  it("keeps the tags and override codes inside the text", () => {
    const content = '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<b>Run</b>, <font color="#ffff00">now</font>!\n';
    expect(texts(content)).toEqual([["1", '{\\an8}<b>Run</b>, <font color="#ffff00">now</font>!']]);
  });

  it("reads nothing from an empty file", () => {
    expect(read("")).toEqual([]);
    expect(read("\u{feff}\r\n\r\n")).toEqual([]);
  });

  it("rejects a file without any cue, naming the file", () => {
    expect(() => read("This is not a subtitle file.\n")).toThrow(ReadError);
    expect(() => read("This is not a subtitle file.\n")).toThrow(/videos\/intro\.en\.srt/);
  });
});
