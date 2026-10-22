import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import { vttReader } from "../../../../src/formats/subtitles/vtt/reader.js";

const file = "captions/tour.vtt";
const read = (content: string) => vttReader.read({ file, content, priority: 0 });
const texts = (content: string) => read(content).map((o) => [o.location.key, o.source]);

const captions = `WEBVTT - Guided tour of the workshop
Kind: captions

STYLE
::cue {
  color: yellow;
}

REGION
id:left
width:40%

NOTE This note is for the editors
and spans two lines.

welcome
00:01.000 --> 00:03.000 align:start position:10%
<v Ada>Welcome to the workshop.</v>

00:03.500 --> 00:05.000
<v Ben>Mind the <c.yellow>wet paint</c>.

NOTE
Another note, alone on its line.

closing
00:00:12.000 --> 00:00:14.000 line:0
The tour <00:00:12.800>ends here.
`;

describe("vttReader", () => {
  it("reads the cues and skips the header, NOTE, STYLE and REGION blocks", () => {
    expect(texts(captions)).toEqual([
      ["welcome", "<v Ada>Welcome to the workshop.</v>"],
      ["2", "<v Ben>Mind the <c.yellow>wet paint</c>."],
      ["closing", "The tour <00:00:12.800>ends here."],
    ]);
  });

  it("records the identifier, or the position of the cue, and the line of its text", () => {
    expect(read(captions).map((o) => o.location)).toEqual([
      { file, key: "welcome", line: 18 },
      { file, key: "2", line: 21 },
      { file, key: "closing", line: 28 },
    ]);
  });

  it("groups the cues of a scene: a pause of more than two seconds starts a new one", () => {
    expect(read(captions).map((o) => o.group)).toEqual([`${file}#welcome`, `${file}#welcome`, `${file}#closing`]);
  });

  it("accepts a bare header, CRLF line endings and a byte order mark", () => {
    const content = "\u{feff}WEBVTT\r\n\r\n1\r\n00:00.500 --> 00:01.500\r\nFirst line\r\nSecond line\r\n";
    expect(texts(content)).toEqual([["1", "First line\nSecond line"]]);
  });

  it("does not take a cue starting with the word NOTE in its text for a note", () => {
    const content = "WEBVTT\n\n00:01.000 --> 00:02.000\nNOTE: the door is locked\n";
    expect(texts(content)).toEqual([["1", "NOTE: the door is locked"]]);
  });

  it("reads nothing from a file with only a header", () => {
    expect(read("WEBVTT\n")).toEqual([]);
  });

  it("rejects a file without the WEBVTT header, naming the file", () => {
    expect(() => read("1\n00:00:01,000 --> 00:00:02,000\nHi\n")).toThrow(ReadError);
    expect(() => read("1\n00:00:01,000 --> 00:00:02,000\nHi\n")).toThrow(/captions\/tour\.vtt.*WEBVTT/);
  });
});
