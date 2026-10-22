import { describe, expect, it } from "vitest";
import { parseCues, parseTimestamp, SubtitleSyntaxError } from "../../../src/formats/subtitles/cues.js";

describe("parseTimestamp", () => {
  it("reads SRT and WebVTT timestamps in milliseconds", () => {
    expect(parseTimestamp("00:00:01,000")).toBe(1000);
    expect(parseTimestamp("01:02:03.456")).toBe(3_723_456);
    expect(parseTimestamp("02:03.456")).toBe(123_456); // WebVTT: hours are optional
    expect(parseTimestamp("0:00:01,5")).toBe(1500); // a short fraction is tenths, not milliseconds
    expect(parseTimestamp("123:00:00.000")).toBe(442_800_000);
  });

  it("returns undefined for what is not a timestamp", () => {
    expect(parseTimestamp("1:2")).toBeUndefined();
    expect(parseTimestamp("00:00:01")).toBeUndefined();
    expect(parseTimestamp("hello")).toBeUndefined();
  });
});

describe("parseCues", () => {
  it("gives the offsets of the text of each cue, so that a writer can replace it in place", () => {
    const content =
      "1\n00:00:01,000 --> 00:00:02,500\nHello there\nSecond line\n\n2\n00:00:03,000 --> 00:00:04,000\nBye\n";
    const cues = parseCues(content, "srt");
    expect(cues.map((cue) => [cue.id, cue.startMs, cue.endMs, cue.text, cue.line])).toEqual([
      ["1", 1000, 2500, "Hello there\nSecond line", 3],
      ["2", 3000, 4000, "Bye", 8],
    ]);
    const [first] = cues;
    expect(first && content.slice(first.textStart, first.textEnd)).toBe("Hello there\nSecond line");
  });

  it("keeps the cue settings of a WebVTT timing line out of the text", () => {
    const content = "WEBVTT\n\n00:01.000 --> 00:02.000 align:start position:10%\nOn the left\n";
    expect(parseCues(content, "vtt").map((cue) => [cue.id, cue.text])).toEqual([[undefined, "On the left"]]);
  });

  it("gives a cue without text an empty range right after its timing line", () => {
    const content = "1\r\n00:00:01,000 --> 00:00:02,000\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nNext\r\n";
    const [empty, next] = parseCues(content, "srt");
    expect(empty).toMatchObject({ text: "", textStart: content.indexOf("\r\n\r\n") + 2 });
    expect(empty?.textEnd).toBe(empty?.textStart);
    expect(next?.text).toBe("Next");
  });

  it("names the problem when a WebVTT file has no header", () => {
    expect(() => parseCues("00:01.000 --> 00:02.000\nHi\n", "vtt")).toThrow(SubtitleSyntaxError);
    expect(() => parseCues("WEBVTTX\n", "vtt")).toThrow(/WEBVTT/);
  });
});
