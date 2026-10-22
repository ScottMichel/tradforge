import { stripBom } from "../../../core/reader.js";
import type { Writer } from "../../../core/writer.js";
import { encodeYamlScalar } from "../../apps/yaml/writer.js";
import { type MarkdownText, markdownTexts } from "./blocks.js";

/**
 * Replaces each text of a Markdown document in place: code, HTML, tables' layout and everything between the texts
 * stay byte for byte. A paragraph is written on one line, with the hard breaks of the translation, each followed by
 * the prefix of its block ("> ", the indentation of a list item). With asciiOnly, characters outside ASCII become
 * HTML character references (&#233;). An untranslated text stays as it is, whatever "untranslated" says: leaving a
 * paragraph out would break the document.
 */
export const markdownWriter: Writer = {
  format: "markdown",
  write({ file, content, translate, options }) {
    const text = stripBom(content); // the offsets of markdownTexts are relative to the text without BOM
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;
    for (const found of markdownTexts(file, text)) {
      const translation = translate(found.value);
      if (translation === undefined) {
        untranslated++;
        continue;
      }
      translated++;
      output += text.slice(copied, found.start) + encode(found, translation, options.asciiOnly, eol);
      copied = found.end;
    }
    return { content: output + text.slice(copied), translated, untranslated };
  },
};

function encode(found: MarkdownText, translation: string, asciiOnly: boolean, eol: string): string {
  if (found.scalar !== undefined) return encodeYamlScalar(translation, found.scalar, asciiOnly, eol);
  const references = (value: string) =>
    asciiOnly ? value.replace(/\P{ASCII}/gu, (char) => `&#${char.codePointAt(0)};`) : value;
  if (found.kind === "cell") return references(translation.replaceAll("\n", " ").replace(/(?<!\\)\|/g, "\\|"));
  if (found.kind === "heading") return references(translation.replaceAll("\n", " "));
  return references(translation.split("\n").join(`${found.breakMarker}${eol}${found.prefix}`));
}
