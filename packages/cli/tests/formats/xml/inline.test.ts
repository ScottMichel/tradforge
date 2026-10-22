import { describe, expect, it } from "vitest";
import { escapeXmlText, flattenInline, splitByTags } from "../../../src/formats/xml/inline.js";
import { parseXml } from "../../../src/formats/xml/parser.js";

describe("flattenInline", () => {
  it("keeps the inline tags as written and decodes the text around and inside them", () => {
    const src = '<s>Press <g id="1">Quit &amp; leave</g><x id="2"/> &lt;now&gt;</s>';
    expect(flattenInline(src, parseXml(src))).toEqual({
      text: 'Press <g id="1">Quit & leave</g><x id="2"/> <now>',
      tags: ['<g id="1">', "</g>", '<x id="2"/>'],
    });
  });
});

describe("splitByTags", () => {
  it("cuts a translation into the known tags and the texts between them", () => {
    expect(splitByTags('Appuyez <g id="1">ici</g> <maintenant>', ['<g id="1">', "</g>"])).toEqual([
      { kind: "text", value: "Appuyez " },
      { kind: "tag", value: '<g id="1">' },
      { kind: "text", value: "ici" },
      { kind: "tag", value: "</g>" },
      { kind: "text", value: " <maintenant>" },
    ]);
  });

  it("prefers the longest tag when one starts like another", () => {
    expect(splitByTags('<x id="10"/>', ['<x id="1', '<x id="10"/>']).map((part) => part.kind)).toEqual(["tag"]);
  });
});

describe("escapeXmlText", () => {
  it("escapes the XML characters, and every non-ASCII character with asciiOnly", () => {
    expect(escapeXmlText("a < b & c > d", false)).toBe("a &lt; b &amp; c &gt; d");
    expect(escapeXmlText("été 😀", true)).toBe("&#233;t&#233; &#128512;");
  });
});
