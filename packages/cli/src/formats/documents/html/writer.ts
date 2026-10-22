import { stripBom } from "../../../core/reader.js";
import type { Writer } from "../../../core/writer.js";
import { splitByTags } from "../../shared/xml/inline.js";
import { parseHtml } from "./document.js";

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** A character reference already written by the translator or kept from the source: &nbsp; &#233; &#x2014; */
const REFERENCE = /^&(?:[A-Za-z][A-Za-z0-9]*|#\d+|#[xX][0-9a-fA-F]+);/;

/**
 * Writes each translation in place and names the target language in <html lang>: scripts, styles, comments and
 * markup stay byte for byte. The inline tags of the source are copied as they are; in the rest, "<", ">" and a
 * bare "&" are escaped. With asciiOnly, characters outside ASCII become references (&#233;). An untranslated text
 * stays as it is: leaving it out would break the page.
 */
export const htmlWriter: Writer = {
  format: "html",
  write({ content, translate, options, languages }) {
    const text = stripBom(content); // the offsets of parseHtml are relative to the text without BOM
    const document = parseHtml(text);
    const edits: Edit[] = [];
    let translated = 0;
    let untranslated = 0;
    if (document.lang !== undefined) edits.push({ ...document.lang, text: `"${languages.target}"` });

    for (const found of document.texts) {
      const translation = translate(found.value);
      if (translation === undefined) {
        untranslated++;
        continue;
      }
      translated++;
      const encoded =
        found.kind === "attribute"
          ? `"${escapeHtml(translation, options.asciiOnly).replaceAll('"', "&quot;")}"`
          : splitByTags(translation, found.tags)
              .map((part) => (part.kind === "tag" ? part.value : escapeHtml(part.value, options.asciiOnly)))
              .join("");
      edits.push({ start: found.start, end: found.end, text: encoded });
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

function escapeHtml(text: string, asciiOnly: boolean): string {
  let encoded = "";
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    const code = text.codePointAt(i) ?? 0;
    if (char === "&") encoded += REFERENCE.test(text.slice(i)) ? "&" : "&amp;";
    else if (char === "<") encoded += "&lt;";
    else if (char === ">") encoded += "&gt;";
    else if (asciiOnly && code > 0x7f) {
      encoded += `&#${code};`;
      if (code > 0xffff) i++; // the second unit of a surrogate pair
    } else encoded += char;
  }
  return encoded;
}
