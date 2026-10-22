import { escapeXmlText } from "../xml/inline.js";
import { parseXml, type XmlElement, type XmlNode } from "../xml/parser.js";

/**
 * The paragraphs of an office document part, in the XML dialect of Word (WordprocessingML: word/document.xml) or of
 * PowerPoint and Excel drawings (DrawingML: ppt/slides/slide1.xml).
 *
 * Both split a paragraph into runs, one per change of format. The translator gets the paragraph as one text: the
 * main format as plain text, any other one as a tag around its text (<g1>...</g1>), and what is not text (tabs,
 * breaks, pictures, fields) as an empty tag (<x1/>). The writer rebuilds the runs in the order of the translation,
 * each with its format, so that a word in bold may move within the sentence.
 *
 * Left out: paragraphs with tracked changes (accepting or rejecting a revision is not tradforge's call) and the
 * paragraphs of text boxes inside a paragraph. Spelling marks and revision ids are dropped from a translated
 * paragraph; bookmarks and comment ranges move to its start.
 */

/** The names a dialect gives to the parts of a paragraph. */
export interface Dialect {
  readonly paragraph: string;
  readonly paragraphProperties: string;
  /** The child of the paragraph properties that names its style, and the attribute that holds the name. */
  readonly paragraphStyle?: { readonly element: string; readonly attribute: string };
  readonly run: string;
  readonly runProperties: string;
  readonly text: string;
  /** The run that holds a non-text child of a run (a tab), so that it keeps its format; undefined: none. */
  readonly runAtom?: (properties: string, child: string) => string;
  readonly fieldChar?: { readonly element: string; readonly attribute: string };
  readonly anchors: ReadonlySet<string>;
  readonly trackedChanges: ReadonlySet<string>;
  readonly containers: ReadonlySet<string>;
  readonly dropped: ReadonlySet<string>;
  /** Elements that close a paragraph and must stay last (DrawingML's end of paragraph properties). */
  readonly trailers: ReadonlySet<string>;
  /** Elements whose paragraphs are not looked at. */
  readonly skipped: ReadonlySet<string>;
  /** A run of text; rich: the paragraph holds other formats or atoms too (a spreadsheet string then needs runs). */
  readonly writeRun: (properties: string, text: string, rich: boolean) => string;
}

/**
 * SpreadsheetML: the strings of an Excel workbook (<si> of the shared strings, <is> of an inline string). A plain
 * string is a <t>; a rich one is made of runs.
 */
export const SPREADSHEET: Dialect = {
  paragraph: "si",
  paragraphProperties: "",
  run: "r",
  runProperties: "rPr",
  text: "t",
  anchors: new Set(),
  trackedChanges: new Set(),
  containers: new Set(),
  // phonetic guides (Japanese) would no longer match a translated text
  dropped: new Set(["rPh", "phoneticPr"]),
  trailers: new Set(),
  skipped: new Set(),
  writeRun: (properties, text, rich) =>
    rich || properties !== ""
      ? `<r>${properties}<t xml:space="preserve">${text}</t></r>`
      : `<t xml:space="preserve">${text}</t>`,
};

/** The inline strings of a worksheet (<c t="inlineStr"><is>...</is></c>), written as shared strings are. */
export const INLINE_STRING: Dialect = { ...SPREADSHEET, paragraph: "is" };

export const WORD: Dialect = {
  paragraph: "w:p",
  paragraphProperties: "w:pPr",
  paragraphStyle: { element: "w:pStyle", attribute: "w:val" },
  run: "w:r",
  runProperties: "w:rPr",
  text: "w:t",
  runAtom: (properties, child) => `<w:r>${properties}${child}</w:r>`,
  fieldChar: { element: "w:fldChar", attribute: "w:fldCharType" },
  anchors: new Set([
    "w:bookmarkStart",
    "w:bookmarkEnd",
    "w:commentRangeStart",
    "w:commentRangeEnd",
    "w:permStart",
    "w:permEnd",
  ]),
  trackedChanges: new Set(["w:ins", "w:del", "w:moveFrom", "w:moveTo"]),
  containers: new Set(["w:hyperlink", "w:smartTag"]),
  dropped: new Set(["w:proofErr", "w:lastRenderedPageBreak"]),
  trailers: new Set(),
  skipped: new Set(["w:txbxContent"]),
  writeRun: (properties, text) => `<w:r>${properties}<w:t xml:space="preserve">${text}</w:t></w:r>`,
};

/** DrawingML: the text of PowerPoint slides and of the shapes of Excel and Word drawings. */
export const DRAWING: Dialect = {
  paragraph: "a:p",
  paragraphProperties: "a:pPr",
  run: "a:r",
  runProperties: "a:rPr",
  text: "a:t",
  anchors: new Set(),
  trackedChanges: new Set(),
  containers: new Set(),
  dropped: new Set(),
  trailers: new Set(["a:endParaRPr"]),
  skipped: new Set(),
  writeRun: (properties, text) => `<a:r>${properties}<a:t>${text}</a:t></a:r>`,
};

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
  readonly dialect: Dialect;
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
  /** Elements that stay at the end of the paragraph. */
  readonly trailers: readonly string[];
}

const NO_FORMAT: Style = { properties: "" };

/** Every paragraph with text of a part, in document order. */
export function parseParagraphs(xml: string, dialect: Dialect = WORD): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const visit = (element: XmlElement) => {
    if (dialect.skipped.has(element.name)) return;
    if (element.name === dialect.paragraph) {
      const paragraph = readParagraph(xml, element, dialect);
      if (paragraph !== undefined) paragraphs.push(paragraph);
      return;
    }
    for (const child of element.children) if (child.kind === "element") visit(child);
  };
  visit(parseXml(xml));
  return paragraphs;
}

function elements(element: XmlElement): XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.kind === "element");
}

function readParagraph(src: string, element: XmlElement, dialect: Dialect): Paragraph | undefined {
  const raw = (node: XmlNode) => src.slice(node.start, node.end);
  const children = elements(element);
  const properties = children.find((child) => child.name === dialect.paragraphProperties);
  const styleName = dialect.paragraphStyle;
  const style =
    properties === undefined || styleName === undefined
      ? undefined
      : elements(properties)
          .find((child) => child.name === styleName.element)
          ?.attributes.find((attr) => attr.name === styleName.attribute)?.value;

  const pieces: Piece[] = [];
  const anchors: string[] = [];
  const trailers: string[] = [];
  /** Inside a complex field (fldChar begin ... end): the runs are kept whole, as one atom. */
  let field: string | undefined;

  const readRun = (run: XmlElement, container: Style["container"]) => {
    const runProperties = elements(run).find((child) => child.name === dialect.runProperties);
    const styleOf: Style = {
      properties: runProperties === undefined ? "" : raw(runProperties),
      ...(container !== undefined ? { container } : {}),
    };
    const content = elements(run).filter((child) => child.name !== dialect.runProperties);
    const fieldChar = dialect.fieldChar;
    const fieldType =
      fieldChar === undefined
        ? undefined
        : content
            .find((child) => child.name === fieldChar.element)
            ?.attributes.find((attr) => attr.name === fieldChar.attribute)?.value;
    if (field !== undefined || fieldType === "begin") {
      field = (field ?? "") + raw(run);
      if (fieldType === "end") {
        pieces.push({ kind: "atom", xml: field });
        field = undefined;
      }
      return;
    }
    for (const child of content) {
      if (child.name === dialect.text) {
        pieces.push({ kind: "text", text: textOf(child), style: styleOf });
      } else if (!dialect.dropped.has(child.name)) {
        const xml = dialect.runAtom?.(styleOf.properties, raw(child)) ?? raw(child);
        pieces.push({ kind: "atom", xml });
      }
    }
  };

  for (const child of children) {
    if (child.name === dialect.paragraphProperties || dialect.dropped.has(child.name)) continue;
    if (dialect.trackedChanges.has(child.name)) return undefined;
    if (child.name === dialect.run) readRun(child, undefined);
    else if (child.name === dialect.text) pieces.push({ kind: "text", text: textOf(child), style: NO_FORMAT });
    else if (dialect.anchors.has(child.name)) anchors.push(raw(child));
    else if (dialect.trailers.has(child.name)) trailers.push(raw(child));
    else if (dialect.containers.has(child.name)) {
      const open = src.slice(child.start, child.contentStart);
      const container = { open, close: src.slice(child.contentEnd, child.end) };
      for (const inner of elements(child)) {
        if (inner.name === dialect.run) readRun(inner, container);
        else if (dialect.trackedChanges.has(inner.name)) return undefined;
        else if (dialect.anchors.has(inner.name)) anchors.push(raw(inner));
      }
    } else pieces.push({ kind: "atom", xml: raw(child) }); // fields, breaks, content controls...
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

  return {
    dialect,
    value,
    ...(style !== undefined ? { style } : {}),
    start: properties?.end ?? element.contentStart,
    end: element.contentEnd,
    tags,
    atoms,
    base,
    anchors,
    trailers,
  };
}

/** The text of a text element (<w:t>, <a:t>, <t>). */
function textOf(element: XmlElement): string {
  return element.children.map((node) => (node.kind === "text" || node.kind === "cdata" ? node.value : "")).join("");
}

function sameStyle(a: Style, b: Style): boolean {
  return a.properties === b.properties && a.container?.open === b.container?.open;
}

/**
 * The content of a paragraph for its translation: anchors first, then the runs in the order of the translation,
 * then the elements that close the paragraph.
 */
export function writeParagraph(paragraph: Paragraph, translation: string): string {
  let xml = paragraph.anchors.join("");
  const stack: number[] = [];
  const run = (text: string) => {
    if (text === "") return;
    const style = paragraph.tags[(stack.at(-1) ?? 0) - 1] ?? paragraph.base;
    const rich = paragraph.tags.length > 0 || paragraph.atoms.length > 0;
    xml += paragraph.dialect.writeRun(style.properties, escapeXmlText(text.replaceAll("\n", " "), false), rich);
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
  return xml + paragraph.trailers.join("");
}
