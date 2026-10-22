import type { Writer } from "../../core/writer.js";
import { extractRimWorldTexts, withoutBom } from "./texts.js";

const ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
]);

/**
 * Replaces the text of each translated element in place: declaration, comments (the "EN:" ones included), indentation,
 * attributes and line endings stay byte for byte.
 * Untranslated texts are always kept, whatever the "untranslated" option: a missing list item would shift the index
 * of the next ones, and RimWorld shows the English text for a missing key anyway.
 */
export const rimworldWriter: Writer = {
  format: "rimworld-xml",
  write({ file, content, translate, options }) {
    const { bom, text } = withoutBom(content); // offsets are relative to the text without byte order mark
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;

    for (const found of extractRimWorldTexts(file, text)) {
      const translation = translate(found.value);
      if (translation === undefined) {
        untranslated++;
        continue;
      }
      translated++;
      const encoded =
        found.cdata && !options.asciiOnly ? encodeCData(translation) : encodeXmlText(translation, options.asciiOnly);
      output += text.slice(copied, found.replaceStart) + encoded;
      copied = found.replaceEnd;
    }
    output += text.slice(copied);
    return { content: bom + output, translated, untranslated };
  },
};

/**
 * The XML text of a translation: special characters escaped, line breaks written as RimWorld's literal "\n",
 * and with asciiOnly every non-ASCII character as a decimal character reference (é → &#233;).
 */
export function encodeXmlText(value: string, asciiOnly: boolean): string {
  let encoded = "";
  for (const char of lineBreaksAsRimWorld(value)) {
    const code = char.codePointAt(0) ?? 0;
    const escaped = ESCAPES.get(char);
    if (escaped !== undefined) encoded += escaped;
    else if (code > 0x7f && asciiOnly) encoded += `&#${code};`;
    else encoded += char;
  }
  // ">" may stay as it is (grammar rules are full of "->"), except in "]]>", which XML forbids in a text.
  return encoded.replaceAll("]]>", "]]&gt;");
}

/** A CDATA section; "]]>" cannot appear inside one, so it is split across two sections. */
function encodeCData(value: string): string {
  return `<![CDATA[${lineBreaksAsRimWorld(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function lineBreaksAsRimWorld(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "\\n");
}
