import { escapeXmlText } from "../xml/inline.js";
import { parseXml, type XmlElement, type XmlNode } from "../xml/parser.js";

/**
 * The paragraphs of a WordprocessingML part (word/document.xml, headers, footers, notes).
 *
 * Word splits a paragraph (<w:p>) into runs (<w:r>), one per change of format. The translator gets the paragraph as
 * one text: the main format as plain text, any other one as a tag around its text (<g1>...</g1>), and what is not
 * text (tabs, breaks, pictures, fields, note references) as an empty tag (<x1/>). The writer rebuilds the runs in
 * the order of the translation, each with its format, so that a word in bold may move within the sentence.
 *
 * Left out: paragraphs with tracked changes (accepting or rejecting a revision is not tradforge's call) and the
 * paragraphs of text boxes. Spelling marks (<w:proofErr>) and revision ids are dropped from a translated paragraph;
 * bookmarks and comment ranges move to its start.
 */

interface Style {
  /** The run properties, as written (<w:rPr>...</w:rPr>, or nothing). */
  readonly properties: string;
  /** The element around the runs, such as a hyperlink: its start and end tags. */
  readonly container?: { readonly open: string; readonly close: string };
}

type Piece =
  | { readonly kind: "text"; readonly text: string; readonly style: Style }
  | { readonly kind: "atom"; readonly xml: string };

export interface Paragraph {
  /** The text for the translator, with its tags. */
  readonly value: string;
  /** The paragraph style (<w:pStyle w:val="Heading1"/>), if any. */
  readonly style?: string;
  /** Offsets of the content to replace: from after the paragraph properties to the end tag. */
  readonly start: number;
  readonly end: number;
  /** The format of each <gN> tag (index N - 1), and the XML of each <xN/> tag. */
  readonly tags: readonly Style[];
  readonly atoms: readonly string[];
  /** The format of plain text. */
  readonly base: Style;
  /** Bookmarks and comment ranges, written at the start of a translated paragraph. */
  readonly anchors: readonly string[];
}

const ANCHORS = new Set([
  "w:bookmarkStart",
  "w:bookmarkEnd",
  "w:commentRangeStart",
  "w:commentRangeEnd",
  "w:permStart",
  "w:permEnd",
]);
const TRACKED_CHANGES = new Set(["w:ins", "w:del", "w:moveFrom", "w:moveTo"]);
const CONTAINERS = new Set(["w:hyperlink", "w:smartTag"]);
const DROPPED = new Set(["w:proofErr", "w:lastRenderedPageBreak"]);
const NO_FORMAT: Style = { properties: "" };

/** Every paragraph with text of a part, in document order. Paragraphs of text boxes are not looked at. */
export function parseParagraphs(xml: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const visit = (element: XmlElement) => {
    if (element.name === "w:txbxContent") return;
    if (element.name === "w:p") {
      const paragraph = readParagraph(xml, element);
      if (paragraph !== undefined) paragraphs.push(paragraph);
      return;
    }
    for (const child of element.children) if (child.kind === "element") visit(child);
  };
  visit(parseXml(xml));
  return paragraphs;
}

function readParagraph(src: string, element: XmlElement): Paragraph | undefined {
  const raw = (node: XmlNode) => src.slice(node.start, node.end);
  const children = element.children.filter((child): child is XmlElement => child.kind === "element");
  const properties = children.find((child) => child.name === "w:pPr");
  const style = properties?.children
    .filter((child): child is XmlElement => child.kind === "element")
    .find((child) => child.name === "w:pStyle")
    ?.attributes.find((attr) => attr.name === "w:val")?.value;

  const pieces: Piece[] = [];
  const anchors: string[] = [];
  /** Inside a complex field (fldChar begin ... end): the runs are kept whole, as one atom. */
  let field: string | undefined;

  const readRun = (run: XmlElement, container: Style["container"]) => {
    const runProperties = run.children.find(
      (child): child is XmlElement => child.kind === "element" && child.name === "w:rPr",
    );
    const styleOf: Style = {
      properties: runProperties === undefined ? "" : raw(runProperties),
      ...(container !== undefined ? { container } : {}),
    };
    const content = run.children.filter(
      (child): child is XmlElement => child.kind === "element" && child.name !== "w:rPr",
    );
    const fieldChar = content
      .find((child) => child.name === "w:fldChar")
      ?.attributes.find((attr) => attr.name === "w:fldCharType")?.value;
    if (field !== undefined || fieldChar === "begin") {
      field = (field ?? "") + raw(run);
      if (fieldChar === "end") {
        pieces.push({ kind: "atom", xml: field });
        field = undefined;
      }
      return;
    }
    for (const child of content) {
      if (child.name === "w:t") {
        const text = child.children
          .map((node) => (node.kind === "text" || node.kind === "cdata" ? node.value : ""))
          .join("");
        pieces.push({ kind: "text", text, style: styleOf });
      } else if (!DROPPED.has(child.name)) {
        pieces.push({ kind: "atom", xml: `<w:r>${styleOf.properties}${raw(child)}</w:r>` });
      }
    }
  };

  for (const child of children) {
    if (child.name === "w:pPr" || DROPPED.has(child.name)) continue;
    if (TRACKED_CHANGES.has(child.name)) return undefined;
    if (child.name === "w:r") readRun(child, undefined);
    else if (ANCHORS.has(child.name)) anchors.push(raw(child));
    else if (CONTAINERS.has(child.name)) {
      const open = src.slice(child.start, child.contentStart);
      const container = { open, close: src.slice(child.contentEnd, child.end) };
      for (const inner of child.children) {
        if (inner.kind !== "element") continue;
        if (inner.name === "w:r") readRun(inner, container);
        else if (TRACKED_CHANGES.has(inner.name)) return undefined;
        else if (ANCHORS.has(inner.name)) anchors.push(raw(inner));
      }
    } else pieces.push({ kind: "atom", xml: raw(child) }); // fields, content controls, alternate content...
  }
  if (field !== undefined) pieces.push({ kind: "atom", xml: field }); // a field that does not end here

  if (!pieces.some((piece) => piece.kind === "text" && /\p{L}/u.test(piece.text))) return undefined;

  // The base format: the one that holds the most text outside containers.
  const lengths = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.kind === "text" && piece.style.container === undefined) {
      lengths.set(piece.style.properties, (lengths.get(piece.style.properties) ?? 0) + piece.text.length);
    }
  }
  const baseProperties = [...lengths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const base: Style = baseProperties === undefined ? NO_FORMAT : { properties: baseProperties };

  const tags: Style[] = [];
  const atoms: string[] = [];
  let value = "";
  let open: number | undefined;
  const close = () => {
    if (open !== undefined) value += `</g${open}>`;
    open = undefined;
  };
  for (const piece of pieces) {
    if (piece.kind === "atom") {
      close();
      atoms.push(piece.xml);
      value += `<x${atoms.length}/>`;
      continue;
    }
    const isBase = piece.style.container === undefined && piece.style.properties === base.properties;
    if (isBase) {
      close();
      value += piece.text;
      continue;
    }
    let tag = tags.findIndex((known) => sameStyle(known, piece.style)) + 1;
    if (tag === 0) {
      tags.push(piece.style);
      tag = tags.length;
    }
    if (open !== tag) {
      close();
      value += `<g${tag}>`;
      open = tag;
    }
    value += piece.text;
  }
  close();

  const contentStart = properties?.end ?? element.contentStart;
  return {
    value,
    ...(style !== undefined ? { style } : {}),
    start: contentStart,
    end: element.contentEnd,
    tags,
    atoms,
    base,
    anchors,
  };
}

function sameStyle(a: Style, b: Style): boolean {
  return a.properties === b.properties && a.container?.open === b.container?.open;
}

/** The content of a paragraph for its translation: anchors first, then the runs in the order of the translation. */
export function writeParagraph(paragraph: Paragraph, translation: string): string {
  let xml = paragraph.anchors.join("");
  const stack: number[] = [];
  const run = (text: string) => {
    if (text === "") return;
    const style = paragraph.tags[(stack.at(-1) ?? 0) - 1] ?? paragraph.base;
    const escaped = escapeXmlText(text.replaceAll("\n", " "), false);
    xml += `<w:r>${style.properties}<w:t xml:space="preserve">${escaped}</w:t></w:r>`;
  };
  let position = 0;
  for (const match of translation.matchAll(/<g(\d+)>|<\/g(\d+)>|<x(\d+)\/>/g)) {
    run(translation.slice(position, match.index));
    position = match.index + match[0].length;
    const [, opened, closed, atom] = match;
    if (opened !== undefined) {
      const tag = Number(opened);
      const container = paragraph.tags[tag - 1]?.container;
      if (container !== undefined) xml += container.open;
      stack.push(tag);
    } else if (closed !== undefined) {
      const tag = Number(closed);
      if (stack.at(-1) === tag) {
        stack.pop();
        const container = paragraph.tags[tag - 1]?.container;
        if (container !== undefined) xml += container.close;
      }
    } else if (atom !== undefined) {
      xml += paragraph.atoms[Number(atom) - 1] ?? "";
    }
  }
  run(translation.slice(position));
  return xml;
}
