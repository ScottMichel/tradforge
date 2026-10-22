import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import type { BinaryWriterInput } from "../../../../src/core/writer.js";
import { pptxReader } from "../../../../src/formats/documents/pptx/reader.js";
import { pptxWriter } from "../../../../src/formats/documents/pptx/writer.js";
import { readZip, writeZip } from "../../../../src/formats/shared/zip/zip.js";

const file = "talks/forge.pptx";
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const text = (value: string) => new TextEncoder().encode(value);
const shape = (paragraphs: string) => `<p:sp><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`;
const run = (value: string, properties = '<a:rPr lang="en-US"/>') => `<a:r>${properties}<a:t>${value}</a:t></a:r>`;
const slide = (shapes: string) => `<p:sld ${NS}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;

/** A small presentation written for the tests. */
function presentation(): Uint8Array {
  return writeZip([
    { name: "[Content_Types].xml", data: text("<Types/>"), compress: false },
    {
      name: "ppt/slides/slide10.xml",
      data: text(slide(shape(`<a:p>${run("Tenth slide")}</a:p>`))),
      compress: true,
    },
    {
      name: "ppt/slides/slide2.xml",
      data: text(
        slide(
          shape(
            `<a:p><a:pPr lvl="1"/>${run("Light the ")}${run("fire", '<a:rPr lang="en-US" b="1"/>')}<a:br><a:rPr lang="en-US"/></a:br>${run("then wait")}<a:endParaRPr lang="en-US"/></a:p>`,
          ) +
            `<p:graphicFrame><a:tbl><a:tr><a:tc><a:txBody><a:p>${run("In a table")}</a:p></a:txBody></a:tc></a:tr></a:tbl></p:graphicFrame>`,
        ),
      ),
      compress: true,
    },
    {
      name: "ppt/notesSlides/notesSlide2.xml",
      data: text(
        `<p:notes ${NS}><p:cSld><p:spTree>${shape(`<a:p>${run("Speak slowly")}</a:p>`)}</p:spTree></p:cSld></p:notes>`,
      ),
      compress: true,
    },
    {
      name: "ppt/slideLayouts/slideLayout1.xml",
      data: text(slide(shape(`<a:p>${run("Click to add title")}</a:p>`))),
      compress: true,
    },
  ]);
}

describe("pptxReader", () => {
  it("reads the slides in their order, then the speaker notes, but not the layouts", () => {
    const occurrences = pptxReader.read({ file, bytes: presentation(), priority: 0 });
    expect(occurrences.map((o) => [o.location.key, o.source, o.context, o.group])).toEqual([
      ["ppt/slides/slide2.xml#1", "Light the <g1>fire</g1><x1/>then wait", "slide 2", `${file}#slide2`],
      ["ppt/slides/slide2.xml#2", "In a table", "slide 2", `${file}#slide2`],
      ["ppt/slides/slide10.xml#1", "Tenth slide", "slide 10", `${file}#slide10`],
      ["ppt/notesSlides/notesSlide2.xml#1", "Speak slowly", "speaker notes of slide 2", `${file}#slide2`],
    ]);
  });

  it("names the file of something that is not a presentation", () => {
    const empty = writeZip([{ name: "a.txt", data: text("a"), compress: false }]);
    expect(() => pptxReader.read({ file, bytes: empty, priority: 0 })).toThrow(
      new ReadError(file, "not a PowerPoint presentation (no ppt/slides/)"),
    );
  });
});

describe("pptxWriter", () => {
  const write = (translate: BinaryWriterInput["translate"]) =>
    pptxWriter.write({
      file,
      bytes: presentation(),
      translate,
      options: { asciiOnly: false, untranslated: "keep-source" },
      languages: { source: "en", target: "fr" },
    });

  it("rebuilds the runs of each translated paragraph, keeps the end of paragraph last, and sets the language", () => {
    const result = write((value) =>
      value === "Light the <g1>fire</g1><x1/>then wait" ? "Allumez le <g1>feu</g1><x1/>puis attendez" : `[fr] ${value}`,
    );
    expect(result).toMatchObject({ translated: 4, untranslated: 0 });
    const part = (name: string) =>
      new TextDecoder().decode(
        readZip(result.bytes)
          .find((entry) => entry.name === name)
          ?.data(),
      );
    expect(part("ppt/slides/slide2.xml")).toContain(
      '<a:p><a:pPr lvl="1"/><a:r><a:rPr lang="fr"/><a:t>Allumez le </a:t></a:r><a:r><a:rPr lang="fr" b="1"/><a:t>feu</a:t></a:r>' +
        '<a:br><a:rPr lang="fr"/></a:br><a:r><a:rPr lang="fr"/><a:t>puis attendez</a:t></a:r><a:endParaRPr lang="fr"/></a:p>',
    );
    expect(part("ppt/notesSlides/notesSlide2.xml")).toContain("<a:t>[fr] Speak slowly</a:t>");
    expect(part("ppt/slideLayouts/slideLayout1.xml")).toContain("Click to add title");
  });
});
