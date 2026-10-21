import { describe, expect, it } from "vitest";
import { parseXml, type XmlElement, type XmlNode, XmlSyntaxError } from "../../../src/formats/xml/parser.js";

const elements = (nodes: readonly XmlNode[]): XmlElement[] =>
  nodes.filter((node): node is XmlElement => node.kind === "element");

const syntaxError = (source: string): XmlSyntaxError => {
  try {
    parseXml(source);
  } catch (error) {
    if (error instanceof XmlSyntaxError) return error;
    throw error;
  }
  throw new Error("expected a syntax error");
};

describe("parseXml", () => {
  it("parses a root element with child elements, text and positions", () => {
    const source = "<LanguageData>\n  <Greeting>Hello</Greeting>\n</LanguageData>\n";
    const root = parseXml(source);
    expect(root.name).toBe("LanguageData");
    const [greeting] = elements(root.children);
    expect(greeting).toMatchObject({ name: "Greeting", line: 2, selfClosing: false });
    expect(source.slice(greeting?.start, greeting?.end)).toBe("<Greeting>Hello</Greeting>");
    expect(source.slice(greeting?.contentStart, greeting?.contentEnd)).toBe("Hello");
    expect(greeting?.children).toEqual([{ kind: "text", value: "Hello", start: 27, end: 32 }]);
  });

  it("skips the XML declaration, processing instructions and a simple doctype", () => {
    const root = parseXml('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE LanguageData>\n<?pi x?>\n<LanguageData/>');
    expect(root).toMatchObject({ name: "LanguageData", selfClosing: true, children: [] });
  });

  it("decodes the five entities and numeric character references", () => {
    const root = parseXml("<a>&amp;&lt;&gt;&quot;&apos; &#233;&#xE9;&#x1F600;</a>");
    expect(root.children).toMatchObject([{ kind: "text", value: `&<>"' \u{e9}\u{e9}\u{1f600}` }]);
  });

  it("keeps CDATA sections verbatim", () => {
    const root = parseXml("<a>x<![CDATA[<b>&amp; ]] ]>]]>y</a>");
    expect(root.children).toMatchObject([
      { kind: "text", value: "x" },
      { kind: "cdata", value: "<b>&amp; ]] ]>" },
      { kind: "text", value: "y" },
    ]);
  });

  it("reads comments, with their line, anywhere in the content", () => {
    const root = parseXml("<a>\n  <!-- EN: one -- two? -->\n  <b>x</b>\n</a>");
    expect(root.children.filter((node) => node.kind === "comment")).toMatchObject([
      { kind: "comment", value: " EN: one -- two? ", line: 2 },
    ]);
  });

  it("allows comments before and after the root element", () => {
    expect(parseXml("<!-- a -->\n<a>x</a>\n<!-- b -->\n").name).toBe("a");
  });

  it("parses attributes with both quotes, and keeps them", () => {
    const root = parseXml(`<a one="1" two = 'x &amp; "y"'>t</a>`);
    expect(root.attributes).toEqual([
      { name: "one", value: "1" },
      { name: "two", value: 'x & "y"' },
    ]);
  });

  it("parses self-closing elements, with and without a space", () => {
    const root = parseXml('<a><b/><c /><d x="1"/></a>');
    expect(elements(root.children).map((child) => [child.name, child.selfClosing])).toEqual([
      ["b", true],
      ["c", true],
      ["d", true],
    ]);
  });

  it("accepts names with dots, dashes, underscores and digits", () => {
    const root = parseXml("<a><My_Def-2.label>x</My_Def-2.label></a>");
    expect(elements(root.children)[0]?.name).toBe("My_Def-2.label");
  });

  it("parses nested list items", () => {
    const root = parseXml("<a><b><li>one</li><li><li>two</li></li></b></a>");
    const [list] = elements(root.children);
    const items = elements(list?.children ?? []);
    expect(items.map((item) => item.name)).toEqual(["li", "li"]);
    expect(elements(items[1]?.children ?? [])[0]?.children).toMatchObject([{ value: "two" }]);
  });

  it("counts CRLF, CR and LF line endings as one line each", () => {
    const root = parseXml("<a>\r\n<b>x</b>\r<c>y</c>\n<d>z</d></a>");
    expect(elements(root.children).map((child) => child.line)).toEqual([2, 3, 4]);
  });

  it("counts the lines inside comments, CDATA and texts", () => {
    const root = parseXml("<a><!-- 1\n2 --><![CDATA[\n]]>\n\n<b>x\ny</b><c/></a>");
    expect(elements(root.children).map((child) => child.line)).toEqual([5, 6]);
  });

  it.each([
    ["<a><b>x</a>", 1, "expected </b>"],
    ["<a>\n<b>x</b>\n", 1, "unclosed element <a>"], // the line where the element opens
    ["<a>\n<b>\n", 2, "unclosed element <b>"],
    ["<a>x &nbsp; y</a>", 1, "unknown entity &nbsp;"],
    ["<a>x & y</a>", 1, "unknown entity"],
    ["<a>&#xZZ;</a>", 1, "invalid character reference"],
    ["<a>&#1114112;</a>", 1, "invalid character reference"],
    ["<a>\n<!-- x </a>", 2, "unclosed comment"],
    ["<a><![CDATA[x</a>", 1, "unclosed CDATA"],
    ["<a>\n\n< b>x</b></a>", 3, "invalid tag"],
    ['<a x="1>t</a>', 1, "unclosed attribute"],
    ['<a x="1" x="2">t</a>', 1, "duplicate attribute x"],
    ["<a x>t</a>", 1, "expected = after attribute x"],
    ["", 1, "no root element"],
    ["just text", 1, "text outside the root element"],
    ["<a/>\n<b/>", 2, "more than one root element"],
    ["</a>", 1, "unexpected </a>"],
    ['<!DOCTYPE a [<!ENTITY x "y">]><a/>', 1, "internal subset"],
  ])("rejects %j at line %i (%s)", (source, line, message) => {
    const error = syntaxError(source);
    expect(error.line).toBe(line);
    expect(error.message).toContain(message);
  });
});
