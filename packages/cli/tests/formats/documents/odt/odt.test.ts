import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import type { BinaryWriterInput } from "../../../../src/core/writer.js";
import { odtParagraphs, writeOdtParagraph } from "../../../../src/formats/documents/odt/paragraphs.js";
import { odtReader } from "../../../../src/formats/documents/odt/reader.js";
import { odtWriter } from "../../../../src/formats/documents/odt/writer.js";
import { readZip, writeZip } from "../../../../src/formats/shared/zip/zip.js";

const file = "manual/forge.odt";
const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"';
const text = (value: string) => new TextEncoder().encode(value);
const content = (body: string) =>
  `<office:document-content ${NS}><office:body><office:text>${body}</office:text></office:body></office:document-content>`;

describe("odtParagraphs", () => {
  it("reads headings and paragraphs, spans and links as tags, tabs and fields as empty tags", () => {
    const xml = content(
      '<text:h text:style-name="H1" text:outline-level="1">The Cold Forge</text:h>' +
        '<text:p text:style-name="P1">Light   the <text:span text:style-name="T1">fire</text:span>,<text:tab/>see ' +
        '<text:a xlink:href="#guide">the guide</text:a> on page <text:page-number>3</text:page-number>.</text:p>' +
        '<text:p>Two<text:s text:c="2"/>spaces<text:line-break/>next line</text:p>' +
        "<text:p><text:tab/></text:p>" +
        "<text:list><text:list-item><text:p>In a list</text:p></text:list-item></text:list>",
    );
    expect(odtParagraphs(xml).map((paragraph) => paragraph.value)).toEqual([
      "The Cold Forge",
      "Light the <g1>fire</g1>,<x1/>see <g2>the guide</g2> on page <x2/>.",
      "Two  spaces<x1/>next line",
      "In a list",
    ]);
  });

  it("leaves out paragraphs with tracked changes, and the paragraphs inside a note", () => {
    const xml = content(
      '<text:p>Kept<text:change-start text:change-id="c1"/> new<text:change-end text:change-id="c1"/></text:p>' +
        '<text:p>With a note<text:note text:note-class="footnote"><text:note-citation>1</text:note-citation>' +
        "<text:note-body><text:p>The note</text:p></text:note-body></text:note>.</text:p>",
    );
    expect(odtParagraphs(xml).map((paragraph) => paragraph.value)).toEqual(["With a note<x1/>."]);
  });

  it("writes a translation with the tags of its source and the spaces ODF keeps", () => {
    const xml = content(
      '<text:p text:style-name="P1">Light the <text:span text:style-name="T1">fire</text:span><text:tab/></text:p>',
    );
    const [paragraph] = odtParagraphs(xml);
    expect(writeOdtParagraph(paragraph ?? expect.fail(), " Allumez  le <g1>feu</g1> & <x1/>")).toBe(
      '<text:s/>Allumez <text:s/>le <text:span text:style-name="T1">feu</text:span> &amp; <text:tab/>',
    );
  });
});

function document(): Uint8Array {
  return writeZip([
    { name: "mimetype", data: text("application/vnd.oasis.opendocument.text"), compress: false },
    {
      name: "content.xml",
      data: text(content('<text:h text:outline-level="1">The Cold Forge</text:h><text:p>Light the fire.</text:p>')),
      compress: true,
    },
    {
      name: "styles.xml",
      data: text(
        `<office:document-styles ${NS} xmlns:style="s" xmlns:fo="f"><office:styles><style:default-style><style:text-properties fo:language="en" fo:country="US"/></style:default-style></office:styles>` +
          "<office:master-styles><style:master-page><style:footer><text:p>Forge manual</text:p></style:footer></style:master-page></office:master-styles></office:document-styles>",
      ),
      compress: true,
    },
  ]);
}

describe("odtReader", () => {
  it("reads the body, then the headers and footers", () => {
    expect(
      odtReader.read({ file, bytes: document(), priority: 0 }).map((o) => [o.location.key, o.source, o.group]),
    ).toEqual([
      ["content.xml#1", "The Cold Forge", `${file}#content.xml#1`],
      ["content.xml#2", "Light the fire.", `${file}#content.xml#1`],
      ["styles.xml#1", "Forge manual", `${file}#styles.xml#0`],
    ]);
  });

  it("names the file of something that is not a text document", () => {
    const sheet = writeZip([
      { name: "mimetype", data: text("application/vnd.oasis.opendocument.spreadsheet"), compress: false },
    ]);
    expect(() => odtReader.read({ file, bytes: sheet, priority: 0 })).toThrow(
      new ReadError(file, "not an OpenDocument text (mimetype application/vnd.oasis.opendocument.spreadsheet)"),
    );
  });
});

describe("odtWriter", () => {
  it("writes the translations, sets the language, and keeps the mimetype first and stored", () => {
    const result = odtWriter.write({
      file,
      bytes: document(),
      translate: (value) => `[fr] ${value}`,
      options: { asciiOnly: false, untranslated: "keep-source" },
      languages: { source: "en", target: "fr-CA" },
    } satisfies BinaryWriterInput);
    expect(result).toMatchObject({ translated: 3, untranslated: 0 });
    const entries = readZip(result.bytes);
    expect(entries[0]).toMatchObject({ name: "mimetype", method: 0 });
    const part = (name: string) => new TextDecoder().decode(entries.find((entry) => entry.name === name)?.data());
    expect(part("content.xml")).toContain('<text:h text:outline-level="1">[fr] The Cold Forge</text:h>');
    expect(part("styles.xml")).toContain('fo:language="fr" fo:country="CA"');
    expect(part("styles.xml")).toContain("<text:p>[fr] Forge manual</text:p>");
  });
});
