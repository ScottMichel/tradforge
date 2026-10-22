import { stripBom } from "../../../core/reader.js";
import type { Writer } from "../../../core/writer.js";
import { escapeXmlText } from "../../shared/xml/inline.js";
import { parseResx } from "./resources.js";

/**
 * Writes each translation in the <value> of its string: the schema, the headers, the files and the designer data stay
 * byte for byte. With "omit", an untranslated string is left out, and .NET falls back on the neutral resources.
 */
export const resxWriter: Writer = {
  format: "resx",
  write({ file, content, translate, options }) {
    const text = stripBom(content); // the offsets of parseResx are relative to the text without BOM
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;
    for (const resource of parseResx(file, text)) {
      const translation = translate(resource.value);
      if (translation !== undefined) {
        translated++;
        output += text.slice(copied, resource.element.contentStart) + escapeXmlText(translation, options.asciiOnly);
        copied = resource.element.contentEnd;
        continue;
      }
      untranslated++;
      if (options.untranslated === "omit") {
        const { start, end } = lineOf(text, resource.data.start, resource.data.end);
        output += text.slice(copied, start);
        copied = end;
      }
    }
    return { content: output + text.slice(copied), translated, untranslated };
  },
};

/** The whole lines of an element when it stands alone on them, the element itself otherwise. */
function lineOf(text: string, start: number, end: number): { start: number; end: number } {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const after = /^[ \t]*\r?\n/.exec(text.slice(end))?.[0];
  if (!/^[ \t]*$/.test(text.slice(lineStart, start)) || after === undefined) return { start, end };
  return { start: lineStart, end: end + after.length };
}
