import { describe, expect, it } from "vitest";
import { parseParagraphs, writeParagraph } from "../../../src/formats/docx/paragraphs.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const body = (paragraphs: string) => `<w:document ${W}><w:body>${paragraphs}</w:body></w:document>`;
const bold = "<w:rPr><w:b/></w:rPr>";

describe("parseParagraphs", () => {
  it("joins the runs of a paragraph into one text, other formats as tags, and skips paragraphs without text", () => {
    const xml = body(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>The Cold Forge</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t xml:space="preserve">Light the </w:t></w:r><w:proofErr w:type="spellStart"/>` +
        `<w:r w:rsidR="00A1">${bold}<w:t>fire</w:t></w:r><w:r><w:t xml:space="preserve"> now</w:t></w:r>` +
        `<w:r><w:tab/></w:r><w:r><w:t>&amp; wait.</w:t></w:r></w:p>` +
        `<w:p><w:r><w:tab/></w:r></w:p>`,
    );
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs.map((paragraph) => [paragraph.value, paragraph.style])).toEqual([
      ["The Cold Forge", "Heading1"],
      ["Light the <g1>fire</g1> now<x1/>& wait.", undefined],
    ]);
  });

  it("keeps a link as a tag around its text, and a field or a picture as an empty tag", () => {
    const xml = body(
      `<w:p><w:r><w:t xml:space="preserve">See </w:t></w:r>` +
        `<w:hyperlink r:id="rId5"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>the guide</w:t></w:r></w:hyperlink>` +
        `<w:r><w:t xml:space="preserve"> on page </w:t></w:r>` +
        `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGEREF guide</w:instrText></w:r>` +
        `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>3</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
        `<w:r><w:t>.</w:t></w:r><w:r><w:drawing>picture</w:drawing></w:r></w:p>`,
    );
    expect(parseParagraphs(xml).map((paragraph) => paragraph.value)).toEqual([
      "See <g1>the guide</g1> on page <x1/>.<x2/>",
    ]);
  });

  it("leaves out paragraphs with tracked changes, and those inside text boxes", () => {
    const xml = body(
      `<w:p><w:r><w:t>Kept</w:t></w:r><w:ins w:id="1"><w:r><w:t> inserted</w:t></w:r></w:ins></w:p>` +
        `<w:p><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>In a box</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r>` +
        `<w:r><w:t>Around the box</w:t></w:r></w:p>`,
    );
    expect(parseParagraphs(xml).map((paragraph) => paragraph.value)).toEqual(["<x1/>Around the box"]);
  });
});

describe("writeParagraph", () => {
  const xml = body(
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:bookmarkStart w:id="0" w:name="intro"/>` +
      `<w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">Light the </w:t></w:r>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>red</w:t></w:r>` +
      `<w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve"> fire</w:t></w:r><w:r><w:tab/></w:r>` +
      `<w:hyperlink r:id="rId5"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>now</w:t></w:r></w:hyperlink>` +
      `<w:bookmarkEnd w:id="0"/></w:p>`,
  );

  it("rebuilds the runs in the order of the translation, each with its format", () => {
    const [paragraph] = parseParagraphs(xml);
    expect(paragraph?.value).toBe("Light the <g1>red</g1> fire<x1/><g2>now</g2>");
    const written = writeParagraph(
      paragraph ?? expect.fail(),
      "Allumez le feu <g1>rouge</g1> & <g2>maintenant</g2><x1/>",
    );
    expect(written).toBe(
      '<w:bookmarkStart w:id="0" w:name="intro"/><w:bookmarkEnd w:id="0"/>' +
        '<w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">Allumez le feu </w:t></w:r>' +
        '<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">rouge</w:t></w:r>' +
        '<w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve"> &amp; </w:t></w:r>' +
        '<w:hyperlink r:id="rId5"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">maintenant</w:t></w:r></w:hyperlink>' +
        "<w:r><w:tab/></w:r>",
    );
    expect(xml.slice(paragraph?.start, paragraph?.end)).toMatch(/^<w:bookmarkStart.*<w:bookmarkEnd w:id="0"\/>$/);
  });
});
