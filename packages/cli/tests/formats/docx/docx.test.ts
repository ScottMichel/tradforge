import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import type { BinaryWriterInput } from "../../../src/core/writer.js";
import { docxReader } from "../../../src/formats/docx/reader.js";
import { docxWriter } from "../../../src/formats/docx/writer.js";
import { readZip, writeZip } from "../../../src/formats/zip/zip.js";

const file = "manual/forge.docx";
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const text = (value: string) => new TextEncoder().encode(value);

/** A small document written for the tests, with the parts Word reads. */
function document(): Uint8Array {
  const paragraph = (style: string, content: string) =>
    `<w:p>${style === "" ? "" : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`}${content}</w:p>`;
  const run = (value: string, properties = "") => `<w:r>${properties}<w:t xml:space="preserve">${value}</w:t></w:r>`;
  return writeZip([
    { name: "[Content_Types].xml", data: text("<Types/>"), compress: false },
    {
      name: "word/document.xml",
      data: text(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>` +
          paragraph("Heading1", run("The Cold Forge")) +
          paragraph("", run("Light the ") + run("fire", '<w:rPr><w:b/><w:lang w:val="en-US"/></w:rPr>')) +
          `<w:tbl><w:tr><w:tc>${paragraph("", run("In a table"))}</w:tc></w:tr></w:tbl>` +
          paragraph("Heading1", run("Second chapter")) +
          `<w:sectPr/></w:body></w:document>`,
      ),
      compress: true,
    },
    {
      name: "word/footer1.xml",
      data: text(`<w:ftr ${W}>${paragraph("", run("Page footer"))}</w:ftr>`),
      compress: true,
    },
    {
      name: "word/styles.xml",
      data: text(
        `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
      ),
      compress: true,
    },
    { name: "word/media/image1.png", data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47), compress: false },
  ]);
}

describe("docxReader", () => {
  it("reads the paragraphs of the body, then of the headers, footers and notes", () => {
    const occurrences = docxReader.read({ file, bytes: document(), priority: 0 });
    expect(occurrences.map((o) => [o.location.key, o.source, o.context, o.group])).toEqual([
      ["word/document.xml#1", "The Cold Forge", "Heading1", `${file}#word/document.xml#1`],
      ["word/document.xml#2", "Light the <g1>fire</g1>", undefined, `${file}#word/document.xml#1`],
      ["word/document.xml#3", "In a table", undefined, `${file}#word/document.xml#1`],
      ["word/document.xml#4", "Second chapter", "Heading1", `${file}#word/document.xml#2`],
      ["word/footer1.xml#1", "Page footer", undefined, `${file}#word/footer1.xml#0`],
    ]);
  });

  it("names the file of something that is not a Word document", () => {
    expect(() => docxReader.read({ file, bytes: text("nope"), priority: 0 })).toThrow(
      new ReadError(file, "not a ZIP archive (no end of central directory)"),
    );
    const empty = writeZip([{ name: "a.txt", data: text("a"), compress: false }]);
    expect(() => docxReader.read({ file, bytes: empty, priority: 0 })).toThrow(/no word\/document.xml/);
  });
});

describe("docxWriter", () => {
  const write = (bytes: Uint8Array, translate: BinaryWriterInput["translate"]) =>
    docxWriter.write({
      file,
      bytes,
      translate,
      options: { asciiOnly: false, untranslated: "keep-source" },
      languages: { source: "en", target: "fr" },
    });

  it("writes the translations, sets the language, and copies every other part as it was", () => {
    const source = document();
    const result = write(source, (value) =>
      value === "Light the <g1>fire</g1>" ? "Allumez le <g1>feu</g1>" : `[fr] ${value}`,
    );
    expect(result).toMatchObject({ translated: 5, untranslated: 0 });
    const before = readZip(source);
    const after = readZip(result.bytes);
    expect(after.map((entry) => entry.name)).toEqual(before.map((entry) => entry.name));
    const part = (name: string) => new TextDecoder().decode(after.find((entry) => entry.name === name)?.data());
    expect(part("word/document.xml")).toContain(
      '<w:r><w:t xml:space="preserve">Allumez le </w:t></w:r><w:r><w:rPr><w:b/><w:lang w:val="fr"/></w:rPr><w:t xml:space="preserve">feu</w:t></w:r>',
    );
    expect(part("word/document.xml")).toContain(
      '<w:tc><w:p><w:r><w:t xml:space="preserve">[fr] In a table</w:t></w:r></w:p></w:tc>',
    );
    expect(part("word/footer1.xml")).toContain("[fr] Page footer");
    expect(part("word/styles.xml")).toContain('<w:lang w:val="fr"/>');
    const image = (entries: typeof before) =>
      entries.find((entry) => entry.name === "word/media/image1.png")?.compressed;
    expect(Buffer.from(image(after) ?? []).equals(Buffer.from(image(before) ?? []))).toBe(true);
  });

  it("gives the source back unchanged when nothing is translated", () => {
    const source = document();
    const result = write(source, () => undefined);
    expect(result).toMatchObject({ translated: 0, untranslated: 5 });
    expect(Buffer.from(result.bytes).equals(Buffer.from(source))).toBe(true);
  });
});
