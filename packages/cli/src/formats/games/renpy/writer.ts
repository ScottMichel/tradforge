import type { Writer } from "../../../core/writer.js";
import type { Literal } from "./lexer.js";
import { parseRenpy } from "./reader.js";
import type { RenpyText } from "./script.js";
import { encodePythonString, encodeRenpyString, encodeRenpyTriple } from "./strings.js";

const BOM = "\u{feff}";

/**
 * Writes a translated copy of a Ren'Py script: each translated string literal is replaced in place, and everything
 * else (code, comments, formatting) stays byte for byte. Untranslated texts are always kept: a script cannot lose a
 * line of dialogue, whatever the "untranslated" option.
 */
export const renpyWriter: Writer = {
  format: "renpy",
  write({ file, content, translate, options }) {
    const hasBom = content.startsWith(BOM);
    const text = hasBom ? content.slice(1) : content; // offsets are relative to the text without BOM
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;

    for (const texts of byLiteral(parseRenpy(file, text))) {
      const values = texts.map((t) => {
        const translation = translate(t.value);
        if (translation === undefined) untranslated++;
        else translated++;
        return translation;
      });
      const first = texts[0];
      if (first === undefined || values.every((value) => value === undefined)) continue;
      const literal = first.literal;
      output += text.slice(copied, literal.start) + encode(first, texts, values, options.asciiOnly, newline);
      copied = literal.end;
    }
    output += text.slice(copied);
    return { content: (hasBom ? BOM : "") + output, translated, untranslated };
  },
};

/** The texts grouped by string literal: a triple-quoted dialogue string holds several texts. */
function byLiteral(texts: readonly RenpyText[]): RenpyText[][] {
  const groups = new Map<Literal, RenpyText[]>();
  for (const text of texts) {
    const group = groups.get(text.literal);
    if (group === undefined) groups.set(text.literal, [text]);
    else group.push(text);
  }
  return [...groups.values()].sort((a, b) => (a[0]?.literal.start ?? 0) - (b[0]?.literal.start ?? 0));
}

/** The new literal: same kind of string and same quote as the source (a raw string loses its prefix). */
function encode(
  first: RenpyText,
  texts: readonly RenpyText[],
  values: readonly (string | undefined)[],
  asciiOnly: boolean,
  newline: string,
): string {
  const { encoding, literal } = first;
  const value = values[0] ?? first.value;
  if (encoding.kind === "python") return encodePythonString(value, literal.quote, asciiOnly);
  if (encoding.kind === "renpy") return encodeRenpyString(value, literal.quote, asciiOnly);
  // Every paragraph of the literal, translated or not; paragraphs without letters were never extracted.
  const paragraphs = encoding.paragraphs.map((source, index) => {
    const position = texts.findIndex((t) => t.encoding.kind === "monologue" && t.encoding.index === index);
    return values[position] ?? source;
  });
  return encodeRenpyTriple(paragraphs, literal.quote, asciiOnly, newline, encoding.mode);
}
