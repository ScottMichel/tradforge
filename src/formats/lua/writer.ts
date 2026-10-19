import type { Writer } from "../../core/writer.js";
import { isNaturalText } from "./natural-text.js";
import { lexLua } from "./reader.js";

const BOM = "\uFEFF";
const encoder = new TextEncoder();

const ESCAPES = new Map([
  ["\\", "\\\\"],
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\t", "\\t"],
]);

/**
 * Replaces each translated string literal in place: code, comments and formatting stay byte for byte.
 * Untranslated texts are always kept (code cannot lose a value), whatever the "untranslated" option.
 */
export const luaWriter: Writer = {
  format: "lua",
  write({ file, content, translate, options }) {
    const hasBom = content.startsWith(BOM);
    const text = hasBom ? content.slice(1) : content; // offsets are relative to the text without BOM
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;

    for (const literal of lexLua(file, text)) {
      if (!isNaturalText(literal.value)) continue; // same filter as the reader: code stays code
      const translation = translate(literal.value);
      if (translation === undefined) {
        untranslated++;
        continue;
      }
      translated++;
      // Keep single quotes when the source used them; long strings [[...]] become quoted strings.
      const quote = text.charAt(literal.start) === "'" ? "'" : '"';
      output += text.slice(copied, literal.start) + encodeLuaString(translation, quote, options.asciiOnly);
      copied = literal.end;
    }
    output += text.slice(copied);
    return { content: (hasBom ? BOM : "") + output, translated, untranslated };
  },
};

/**
 * A Lua string literal for any text. Control characters, and with asciiOnly every non-ASCII character,
 * become decimal escapes of their UTF-8 bytes (é → \195\169), always on three digits.
 */
export function encodeLuaString(value: string, quote: '"' | "'", asciiOnly: boolean): string {
  let literal = quote;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const escaped = ESCAPES.get(char);
    if (escaped !== undefined) literal += escaped;
    else if (char === quote) literal += `\\${quote}`;
    else if (code < 0x20 || code === 0x7f) literal += decimalEscape(code);
    else if (code > 0x7f && asciiOnly) for (const byte of encoder.encode(char)) literal += decimalEscape(byte);
    else literal += char;
  }
  return literal + quote;
}

/** Three digits, so that a digit right after the escape is not read as part of it: \0001 is "\0" then "1". */
function decimalEscape(byte: number): string {
  return `\\${String(byte).padStart(3, "0")}`;
}
