import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../src/core/writer.js";
import { srtReader } from "../../../src/formats/srt/reader.js";
import { srtWriter } from "../../../src/formats/srt/writer.js";

const translations = new Map([
  ["Where did you leave the lantern?", "Où as-tu laissé la lanterne ?"],
  ["On the shelf,\nnext to the old map.", "Sur l'étagère,\nà côté de la vieille carte."],
  ["{\\an8}<i>Later that night...</i>", "{\\an8}<i>Plus tard dans la nuit...</i>"],
  ["Short", "Un texte nettement plus long"],
]);

const write = (content: string, translate = (source: string) => translations.get(source)) =>
  srtWriter.write({
    file: "videos/intro.en.srt",
    content,
    translate,
    options: { asciiOnly: false, untranslated: "keep-source" } satisfies WriterInput["options"],
    languages: { source: "en", target: "fr" },
  });

const subtitles = `1
00:00:01,000 --> 00:00:02,500
Where did you leave the lantern?

2
00:00:03,000 --> 00:00:05,000
On the shelf,
next to the old map.


5
00:00:09,000 --> 00:00:10,000 X1:100 X2:600 Y1:50 Y2:80
{\\an8}<i>Later that night...</i>

6
00:00:11,000 --> 00:00:12,000
Not translated yet
`;

describe("srtWriter", () => {
  it("replaces the text of translated cues and keeps numbers, timings and spacing byte for byte", () => {
    const result = write(subtitles);
    expect(result.content).toBe(`1
00:00:01,000 --> 00:00:02,500
Où as-tu laissé la lanterne ?

2
00:00:03,000 --> 00:00:05,000
Sur l'étagère,
à côté de la vieille carte.


5
00:00:09,000 --> 00:00:10,000 X1:100 X2:600 Y1:50 Y2:80
{\\an8}<i>Plus tard dans la nuit...</i>

6
00:00:11,000 --> 00:00:12,000
Not translated yet
`);
    expect(result).toMatchObject({ translated: 3, untranslated: 1 });
  });

  it("returns the file unchanged when nothing is translated", () => {
    const result = write(subtitles, () => undefined);
    expect(result).toStrictEqual({ content: subtitles, translated: 0, untranslated: 4 });
  });

  it("keeps the CRLF line endings, the byte order mark and the missing final line break", () => {
    const content = "\u{feff}1\r\n00:00:01,000 --> 00:00:02,000\r\nOn the shelf,\r\nnext to the old map.";
    expect(write(content).content).toBe(
      "\u{feff}1\r\n00:00:01,000 --> 00:00:02,000\r\nSur l'étagère,\r\nà côté de la vieille carte.",
    );
  });

  it("can change the number of lines of a cue without touching the next one", () => {
    const content = "1\n00:00:01,000 --> 00:00:02,000\nShort\n\n2\n00:00:03,000 --> 00:00:04,000\nKept\n";
    const result = write(content, (source) => (source === "Short" ? "Deux\nlignes" : undefined));
    expect(result.content).toBe(
      "1\n00:00:01,000 --> 00:00:02,000\nDeux\nlignes\n\n2\n00:00:03,000 --> 00:00:04,000\nKept\n",
    );
  });

  it("never writes a blank line inside a cue, which would end it", () => {
    const content = "1\n00:00:01,000 --> 00:00:02,000\nShort\n";
    const result = write(content, () => "Première\n\n  \nseconde  ");
    expect(result.content).toBe("1\n00:00:01,000 --> 00:00:02,000\nPremière\nseconde\n");
  });

  it("keeps the source of a cue whose translation is empty", () => {
    const content = "1\n00:00:01,000 --> 00:00:02,000\nShort\n";
    expect(write(content, () => " \n ")).toStrictEqual({ content, translated: 0, untranslated: 1 });
  });

  it("leaves empty cues and cues without letters alone", () => {
    const content = "1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:02,000 --> 00:00:03,000\n♪ ♪\n";
    expect(write(content, () => "Ne doit pas apparaître")).toStrictEqual({ content, translated: 0, untranslated: 0 });
  });

  it("writes a file that the SRT reader reads back as the translations", () => {
    const written = write(subtitles).content;
    const read = srtReader.read({ file: "videos/intro.fr.srt", content: written, priority: 0 });
    expect(read.map((o) => [o.location.key, o.source])).toEqual([
      ["1", "Où as-tu laissé la lanterne ?"],
      ["2", "Sur l'étagère,\nà côté de la vieille carte."],
      ["5", "{\\an8}<i>Plus tard dans la nuit...</i>"],
      ["6", "Not translated yet"],
    ]);
  });
});
