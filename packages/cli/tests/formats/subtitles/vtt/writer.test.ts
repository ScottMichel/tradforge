import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { vttReader } from "../../../../src/formats/subtitles/vtt/reader.js";
import { vttWriter } from "../../../../src/formats/subtitles/vtt/writer.js";

const translations = new Map([
  ["<v Ada>Welcome to the workshop.</v>", "<v Ada>Bienvenue à l'atelier.</v>"],
  ["<v Ben>Mind the <c.yellow>wet paint</c>.", "<v Ben>Attention à la <c.yellow>peinture fraîche</c>."],
  ["NOTE: the door is locked", "NOTE : la porte est fermée"],
]);

const write = (content: string, translate = (source: string) => translations.get(source)) =>
  vttWriter.write({
    file: "captions/tour.vtt",
    content,
    translate,
    options: { asciiOnly: false, untranslated: "keep-source" } satisfies WriterInput["options"],
    languages: { source: "en", target: "fr" },
  });

const captions = `WEBVTT - Guided tour of the workshop

STYLE
::cue(v[voice="Ada"]) { color: cyan }

NOTE Welcome to the workshop.

welcome
00:01.000 --> 00:03.000 align:start position:10%
<v Ada>Welcome to the workshop.</v>

00:03.500 --> 00:05.000
<v Ben>Mind the <c.yellow>wet paint</c>.

00:06.000 --> 00:07.000
NOTE: the door is locked

00:08.000 --> 00:09.000
Still in English
`;

describe("vttWriter", () => {
  it("replaces the text of translated cues and keeps the header, blocks, identifiers and settings", () => {
    const result = write(captions);
    expect(result.content).toBe(`WEBVTT - Guided tour of the workshop

STYLE
::cue(v[voice="Ada"]) { color: cyan }

NOTE Welcome to the workshop.

welcome
00:01.000 --> 00:03.000 align:start position:10%
<v Ada>Bienvenue à l'atelier.</v>

00:03.500 --> 00:05.000
<v Ben>Attention à la <c.yellow>peinture fraîche</c>.

00:06.000 --> 00:07.000
NOTE : la porte est fermée

00:08.000 --> 00:09.000
Still in English
`);
    expect(result).toMatchObject({ translated: 3, untranslated: 1 });
  });

  it("keeps CRLF line endings and the byte order mark", () => {
    const content = "\u{feff}WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nStill in English\r\n";
    const result = write(content, () => "Toujours\nen anglais");
    expect(result.content).toBe("\u{feff}WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nToujours\r\nen anglais\r\n");
  });

  it("escapes an arrow in a translation, which a player would take for a timing line", () => {
    const content = "WEBVTT\n\n00:01.000 --> 00:02.000\nStill in English\n";
    expect(write(content, () => "A --> B").content).toBe("WEBVTT\n\n00:01.000 --> 00:02.000\nA --&gt; B\n");
  });

  it("writes a file that the WebVTT reader reads back as the translations", () => {
    const written = write(captions).content;
    const read = vttReader.read({ file: "captions/tour.fr.vtt", content: written, priority: 0 });
    expect(read.map((o) => o.source)).toEqual([
      "<v Ada>Bienvenue à l'atelier.</v>",
      "<v Ben>Attention à la <c.yellow>peinture fraîche</c>.",
      "NOTE : la porte est fermée",
      "Still in English",
    ]);
  });
});
