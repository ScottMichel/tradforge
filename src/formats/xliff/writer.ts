import { stripBom } from "../../core/reader.js";
import type { Writer } from "../../core/writer.js";
import type { XmlElement } from "../xml/parser.js";
import { parseXliff, type XliffText } from "./units.js";

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Writes each translation in the target of its unit, and the target language in the document; everything else
 * stays byte for byte.
 *
 * - An existing target gets the translation as content; a missing one is added just after the source, on its own
 *   line when the source has one. In XLIFF 1.2 the target is marked state="translated"; in XLIFF 2 the state
 *   belongs to the segment, and is changed when the segment has one.
 * - Inline tags of the source are copied as they are; the rest of the translation is escaped, so a "<" written by
 *   the translator stays text.
 * - With "omit", a unit with no translation at all is left out; otherwise untranslated units are left as they are.
 */
export const xliffWriter: Writer = {
  format: "xliff",
  write({ file, content, translate, options, languages }) {
    const text = stripBom(content); // the offsets of parseXliff are relative to the text without BOM
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const document = parseXliff(file, text);
    const edits: Edit[] = [];
    let translated = 0;
    let untranslated = 0;

    const languageAttribute = document.version === 1 ? "target-language" : "trgLang";
    for (const holder of document.languageHolders) {
      edits.push(setAttribute(text, holder, languageAttribute, languages.target));
    }

    const units = new Map<XmlElement, { texts: XliffText[]; translations: (string | undefined)[] }>();
    for (const found of document.texts) {
      const unit = units.get(found.unit) ?? { texts: [], translations: [] };
      unit.texts.push(found);
      unit.translations.push(translate(found.value));
      units.set(found.unit, unit);
    }

    for (const [unit, { texts, translations }] of units) {
      if (options.untranslated === "omit" && translations.every((translation) => translation === undefined)) {
        untranslated += texts.length;
        edits.push(removeElement(text, unit));
        continue;
      }
      texts.forEach((found, index) => {
        const translation = translations[index];
        if (translation === undefined) {
          untranslated++;
          return;
        }
        translated++;
        const encoded = found.leading + encodeInline(translation, found.tags, options.asciiOnly) + found.trailing;
        edits.push(...writeTarget(text, found, encoded, document.version, eol));
      });
    }

    let output = "";
    let copied = 0;
    for (const edit of edits.sort((a, b) => a.start - b.start)) {
      output += text.slice(copied, edit.start) + edit.text;
      copied = edit.end;
    }
    return { content: output + text.slice(copied), translated, untranslated };
  },
};

/** The edits that put an encoded translation in the target of a text. */
function writeTarget(src: string, found: XliffText, encoded: string, version: 1 | 2, eol: string): Edit[] {
  const edits: Edit[] = [];
  const target = found.target;
  if (target === undefined) {
    const prefix = found.source.name.slice(0, found.source.name.length - "source".length); // "xlf:" or ""
    const state = version === 1 ? ' state="translated"' : "";
    const indent = lineIndent(src, found.source.start);
    const separator = indent === undefined ? "" : eol + indent;
    const element = `${separator}<${prefix}target${state}>${encoded}</${prefix}target>`;
    edits.push({ start: found.source.end, end: found.source.end, text: element });
  } else {
    const hasState = target.attributes.some((attr) => attr.name === "state");
    let open = src.slice(target.start, target.selfClosing ? target.end : target.contentStart);
    if (version === 1 && hasState) open = withAttribute(open, "state", "translated");
    if (target.selfClosing) open = open.replace(/\s*\/>$/, ">");
    edits.push({ start: target.start, end: target.end, text: `${open}${encoded}</${target.name}>` });
  }
  const segment = found.segment;
  if (segment?.attributes.some((attr) => attr.name === "state") === true) {
    edits.push(setAttribute(src, segment, "state", "translated"));
  }
  return edits;
}

/** The whitespace before an element when it starts its line, undefined when something else comes first. */
function lineIndent(src: string, offset: number): string | undefined {
  const lineStart = Math.max(src.lastIndexOf("\n", offset - 1) + 1, 0);
  const before = src.slice(lineStart, offset);
  return /^[ \t]*$/.test(before) ? before : undefined;
}

/** Removes an element, and its whole line when it stands alone on it. */
function removeElement(src: string, element: XmlElement): Edit {
  const indent = lineIndent(src, element.start);
  const lineEnd = /^[ \t]*\r?\n/.exec(src.slice(element.end))?.[0];
  if (indent === undefined || lineEnd === undefined) return { start: element.start, end: element.end, text: "" };
  return { start: element.start - indent.length, end: element.end + lineEnd.length, text: "" };
}

/** Sets an attribute in the start tag of an element. */
function setAttribute(src: string, element: XmlElement, name: string, value: string): Edit {
  const end = element.selfClosing ? element.end : element.contentStart;
  return { start: element.start, end, text: withAttribute(src.slice(element.start, end), name, value) };
}

/** A start tag with an attribute set: replaced where it is, added at the end otherwise. */
function withAttribute(tag: string, name: string, value: string): string {
  const escaped = escapeAttribute(value);
  const existing = new RegExp(`(\\s${name.replace(/[.-]/g, "\\$&")}\\s*=\\s*)(["'])[^"']*\\2`);
  if (existing.test(tag))
    return tag.replace(existing, (_match, head: string, quote: string) => `${head}${quote}${escaped}${quote}`);
  return tag.replace(/\s*(\/?>)$/, (_match, close: string) => ` ${name}="${escaped}"${close}`);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/**
 * The XML of a translation: the inline tags of the source copied as they are, the rest escaped, and with asciiOnly
 * every non-ASCII character as a character reference (é → &#233;).
 */
export function encodeInline(translation: string, tags: readonly string[], asciiOnly: boolean): string {
  const known = [...new Set(tags)].sort((a, b) => b.length - a.length);
  let encoded = "";
  let position = 0;
  while (position < translation.length) {
    const tag = known.find((candidate) => translation.startsWith(candidate, position));
    if (tag !== undefined) {
      encoded += tag;
      position += tag.length;
      continue;
    }
    const char = String.fromCodePoint(translation.codePointAt(position) ?? 0);
    encoded += encodeCharacter(char, asciiOnly);
    position += char.length;
  }
  return encoded;
}

function encodeCharacter(char: string, asciiOnly: boolean): string {
  if (char === "&") return "&amp;";
  if (char === "<") return "&lt;";
  if (char === ">") return "&gt;";
  const code = char.codePointAt(0) ?? 0;
  return asciiOnly && code > 0x7f ? `&#${code};` : char;
}
