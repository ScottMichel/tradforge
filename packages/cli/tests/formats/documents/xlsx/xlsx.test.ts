import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import type { BinaryWriterInput } from "../../../../src/core/writer.js";
import { xlsxReader } from "../../../../src/formats/documents/xlsx/reader.js";
import { xlsxWriter } from "../../../../src/formats/documents/xlsx/writer.js";
import { readZip, writeZip } from "../../../../src/formats/shared/zip/zip.js";

const file = "data/tools.xlsx";
const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const text = (value: string) => new TextEncoder().encode(value);

/** A small workbook written for the tests. */
function workbook(): Uint8Array {
  return writeZip([
    { name: "[Content_Types].xml", data: text("<Types/>"), compress: false },
    {
      name: "xl/workbook.xml",
      data: text(`<workbook ${S}><sheets><sheet name="Tools" sheetId="1"/></sheets></workbook>`),
      compress: true,
    },
    {
      name: "xl/sharedStrings.xml",
      data: text(
        `<sst ${S} count="4" uniqueCount="4">` +
          "<si><t>Hammer</t></si>" +
          '<si><t xml:space="preserve">Shape the metal </t></si>' +
          '<si><r><t xml:space="preserve">Use </t></r><r><rPr><b/></rPr><t>coal</t></r><rPh sb="0" eb="1"><t>こ</t></rPh></si>' +
          "<si><t>SKU-042</t></si>" +
          "<si><t>12</t></si>" +
          "</sst>",
      ),
      compress: true,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: text(
        `<worksheet ${S}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Inline note</t></is></c><c r="B1"><v>0</v></c></row></sheetData></worksheet>`,
      ),
      compress: true,
    },
    {
      name: "xl/drawings/drawing1.xml",
      data: text(
        `<xdr:wsDr ${A} xmlns:xdr="x"><xdr:sp><xdr:txBody><a:p><a:r><a:rPr lang="en-US"/><a:t>A text box</a:t></a:r></a:p></xdr:txBody></xdr:sp></xdr:wsDr>`,
      ),
      compress: true,
    },
  ]);
}

describe("xlsxReader", () => {
  it("reads the shared strings, the inline strings of the sheets and the text boxes of the drawings", () => {
    const occurrences = xlsxReader.read({ file, bytes: workbook(), priority: 0 });
    expect(occurrences.map((o) => [o.location.key, o.source, o.context])).toEqual([
      ["xl/sharedStrings.xml#1", "Hammer", undefined],
      ["xl/sharedStrings.xml#2", "Shape the metal ", undefined],
      ["xl/sharedStrings.xml#3", "Use <g1>coal</g1>", undefined],
      ["xl/sharedStrings.xml#4", "SKU-042", undefined],
      ["xl/worksheets/sheet1.xml#1", "Inline note", "sheet 1"],
      ["xl/drawings/drawing1.xml#1", "A text box", "drawing 1"],
    ]);
  });

  it("names the file of something that is not a workbook", () => {
    const empty = writeZip([{ name: "a.txt", data: text("a"), compress: false }]);
    expect(() => xlsxReader.read({ file, bytes: empty, priority: 0 })).toThrow(
      new ReadError(file, "not an Excel workbook (no xl/workbook.xml)"),
    );
  });
});

describe("xlsxWriter", () => {
  const write = (translate: BinaryWriterInput["translate"]) =>
    xlsxWriter.write({
      file,
      bytes: workbook(),
      translate,
      options: { asciiOnly: false, untranslated: "keep-source" },
      languages: { source: "en", target: "fr" },
    });

  it("translates the strings in place, plain ones as plain text, rich ones as runs; sheet names stay", () => {
    const result = write((value) => (value === "Use <g1>coal</g1>" ? "Utilisez du <g1>charbon</g1>" : `[fr] ${value}`));
    expect(result).toMatchObject({ translated: 6, untranslated: 0 });
    const part = (name: string) =>
      new TextDecoder().decode(
        readZip(result.bytes)
          .find((entry) => entry.name === name)
          ?.data(),
      );
    const strings = part("xl/sharedStrings.xml");
    expect(strings).toContain('<si><t xml:space="preserve">[fr] Hammer</t></si>');
    expect(strings).toContain(
      '<si><r><t xml:space="preserve">Utilisez du </t></r><r><rPr><b/></rPr><t xml:space="preserve">charbon</t></r></si>',
    );
    expect(strings).toContain('count="4" uniqueCount="4"');
    expect(strings).toContain("<si><t>12</t></si>");
    expect(part("xl/worksheets/sheet1.xml")).toContain('<is><t xml:space="preserve">[fr] Inline note</t></is>');
    expect(part("xl/drawings/drawing1.xml")).toContain('<a:r><a:rPr lang="fr"/><a:t>[fr] A text box</a:t></a:r>');
    expect(part("xl/workbook.xml")).toContain('<sheet name="Tools"');
  });
});
