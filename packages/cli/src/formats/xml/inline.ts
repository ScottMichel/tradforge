import type { XmlElement } from "./parser.js";

/**
 * Inline markup of the XML translation formats (XLIFF <x/> <g>, Android <xliff:g> <b>): the translator gets the
 * tags as they are written in the source, between texts decoded. The writer copies those very tags back, and
 * escapes everything else, so that a "<" written by the translator stays text.
 */

export interface InlineContent {
  /** Text decoded, inline elements as their tags written in the source, the text inside them included. */
  readonly text: string;
  /** Every tag of the content as it is written: start tags, end tags and empty elements. */
  readonly tags: readonly string[];
}

export function flattenInline(src: string, element: XmlElement): InlineContent {
  const tags: string[] = [];
  return { text: flatten(src, element, tags), tags };
}

function flatten(src: string, element: XmlElement, tags: string[]): string {
  let value = "";
  for (const child of element.children) {
    if (child.kind === "text" || child.kind === "cdata") value += child.value;
    else if (child.kind === "element") {
      if (child.selfClosing) {
        const tag = src.slice(child.start, child.end);
        tags.push(tag);
        value += tag;
      } else {
        const open = src.slice(child.start, child.contentStart);
        const close = src.slice(child.contentEnd, child.end);
        tags.push(open, close);
        value += open + flatten(src, child, tags) + close;
      }
    }
  }
  return value;
}

export type InlinePart = { readonly kind: "tag" | "text"; readonly value: string };

/** A translation cut into the known tags of its source and the texts between them, in order. */
export function splitByTags(translation: string, tags: readonly string[]): InlinePart[] {
  const known = [...new Set(tags)].filter((tag) => tag !== "").sort((a, b) => b.length - a.length);
  const parts: InlinePart[] = [];
  let text = "";
  let position = 0;
  while (position < translation.length) {
    const tag = known.find((candidate) => translation.startsWith(candidate, position));
    if (tag === undefined) {
      text += translation.charAt(position);
      position++;
      continue;
    }
    if (text !== "") parts.push({ kind: "text", value: text });
    parts.push({ kind: "tag", value: tag });
    text = "";
    position += tag.length;
  }
  if (text !== "") parts.push({ kind: "text", value: text });
  return parts;
}

/** The XML characters of a text escaped; with asciiOnly, every non-ASCII character as a reference (é → &#233;). */
export function escapeXmlText(text: string, asciiOnly: boolean): string {
  let encoded = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "&") encoded += "&amp;";
    else if (char === "<") encoded += "&lt;";
    else if (char === ">") encoded += "&gt;";
    else encoded += asciiOnly && code > 0x7f ? `&#${code};` : char;
  }
  return encoded;
}
