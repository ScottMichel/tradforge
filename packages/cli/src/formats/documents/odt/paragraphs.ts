import { escapeXmlText } from "../../shared/xml/inline.js";
import { parseXml, type XmlElement } from "../../shared/xml/parser.js";

/**
 * The paragraphs of an OpenDocument text (content.xml, and the headers and footers of styles.xml).
 *
 * In ODF, text sits right in the paragraph (<text:p>, <text:h>), with nested spans for formats and links. The
 * translator gets the paragraph with each span or link as a tag around its text (<g1>...</g1>), and what is not
 * text (tabs, line breaks, fields, notes, frames, bookmarks) as an empty tag (<x1/>). Spaces are read as ODF reads
 * them: a run of spaces is one space, <text:s text:c="3"/> stands for three.
 *
 * Left out: paragraphs with tracked changes, and the paragraphs inside notes and frames (they are an <x/> of the
 * paragraph around them).
 */

export interface OdtParagraph {
  readonly value: string;
  readonly heading: boolean;
  readonly start: number;
  readonly end: number;
  /** The start and end tags of each <gN> (index N - 1), and the XML of each <xN/>. */
  readonly tags: readonly { readonly open: string; readonly close: string }[];
  readonly atoms: readonly string[];
}

const PARAGRAPHS = new Set(["text:p", "text:h"]);
/** Elements around text that change its look or make it a link. */
const SPANS = new Set(["text:span", "text:a", "text:ruby-base"]);
const TRACKED_CHANGES = new Set(["text:change-start", "text:change-end", "text:change"]);
/** Parts of an element that hold no text of their own, and are no paragraphs of the document either. */
const SKIPPED = new Set(["text:tracked-changes", "office:annotation"]);

export function odtParagraphs(xml: string): OdtParagraph[] {
  const paragraphs: OdtParagraph[] = [];
  const visit = (element: XmlElement) => {
    if (SKIPPED.has(element.name)) return;
    if (PARAGRAPHS.has(element.name)) {
      const paragraph = readParagraph(xml, element);
      if (paragraph !== undefined) paragraphs.push(paragraph);
      return;
    }
    for (const child of element.children) if (child.kind === "element") visit(child);
  };
  visit(parseXml(xml));
  return paragraphs;
}

function readParagraph(src: string, element: XmlElement): OdtParagraph | undefined {
  const tags: { open: string; close: string }[] = [];
  const atoms: string[] = [];
  let value = "";
  let changed = false;

  const walk = (node: XmlElement) => {
    for (const child of node.children) {
      if (child.kind === "text" || child.kind === "cdata") {
        value += child.value.replace(/[ \t\r\n]+/g, " ");
      } else if (child.kind === "element") {
        if (TRACKED_CHANGES.has(child.name)) changed = true;
        else if (child.name === "text:s") {
          const count = Number(child.attributes.find((attr) => attr.name === "text:c")?.value ?? "1");
          value += " ".repeat(Number.isInteger(count) && count > 0 ? count : 1);
        } else if (SPANS.has(child.name) && !child.selfClosing) {
          const open = src.slice(child.start, child.contentStart);
          const close = src.slice(child.contentEnd, child.end);
          let tag = tags.findIndex((known) => known.open === open) + 1;
          if (tag === 0) {
            tags.push({ open, close });
            tag = tags.length;
          }
          value += `<g${tag}>`;
          walk(child);
          value += `</g${tag}>`;
        } else if (child.name !== "text:soft-page-break") {
          atoms.push(src.slice(child.start, child.end));
          value += `<x${atoms.length}/>`;
        }
      }
    }
  };
  walk(element);
  if (changed) return undefined;
  if (!/\p{L}/u.test(value.replace(/<[^>]+>/g, ""))) return undefined;
  return {
    value: value.trim(), // spaces at the ends of a paragraph do not show
    heading: element.name === "text:h",
    start: element.contentStart,
    end: element.contentEnd,
    tags,
    atoms,
  };
}

function spacesTag(count: number): string {
  return count === 1 ? "<text:s/>" : `<text:s text:c="${count}"/>`;
}

/** The content of a paragraph for its translation: the tags of its source, the spaces as ODF keeps them. */
export function writeOdtParagraph(paragraph: OdtParagraph, translation: string): string {
  let xml = "";
  let atStart = true;
  const text = (value: string) => {
    if (value === "") return;
    // ODF would merge a run of spaces, and drop a space at the start: <text:s/> keeps them.
    let escaped = escapeXmlText(value.replaceAll("\n", " "), false).replace(
      / {2,}/g,
      (spaces) => ` ${spacesTag(spaces.length - 1)}`,
    );
    if (atStart && escaped.startsWith(" ")) escaped = `${spacesTag(1)}${escaped.slice(1)}`;
    xml += escaped;
    atStart = false;
  };
  let position = 0;
  for (const match of translation.matchAll(/<g(\d+)>|<\/g(\d+)>|<x(\d+)\/>/g)) {
    text(translation.slice(position, match.index));
    position = match.index + match[0].length;
    const [, opened, closed, atom] = match;
    if (opened !== undefined) xml += paragraph.tags[Number(opened) - 1]?.open ?? "";
    else if (closed !== undefined) xml += paragraph.tags[Number(closed) - 1]?.close ?? "";
    else if (atom !== undefined) xml += paragraph.atoms[Number(atom) - 1] ?? "";
    atStart = false;
  }
  text(translation.slice(position));
  return xml;
}
