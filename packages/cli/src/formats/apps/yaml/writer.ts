import { stripBom } from "../../../core/reader.js";
import type { Writer } from "../../../core/writer.js";
import { NOT_TEXT, parseYaml, type YamlScalar } from "./syntax.js";

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Replaces each translated string in place, in the style of the source when the translation allows it, and renames
 * the language key of a Rails file ("en:" → "fr:"). Comments, keys, order and indentation stay byte for byte.
 *
 * A plain string stays plain unless YAML would read the translation otherwise ("No" is a boolean, "a: b" a mapping),
 * a block stays a block, and anything else that cannot keep its style is written in double quotes. With asciiOnly,
 * a translation with characters outside ASCII is written in double quotes with \u escapes.
 * With "omit", the entry of an untranslated mapping value is left out; a list item stays, so that the next ones keep
 * their index.
 */
export const yamlWriter: Writer = {
  format: "yaml",
  write({ file, content, translate, options, languages }) {
    const text = stripBom(content); // the offsets of parseYaml are relative to the text without BOM
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const document = parseYaml(file, text, languages.source);
    const edits: Edit[] = [];
    let translated = 0;
    let untranslated = 0;

    const key = document.languageKey;
    if (key !== undefined) edits.push({ start: key.start, end: key.end, text: languages.target });

    for (const scalar of document.scalars) {
      if (!scalar.isText || scalar.value.trim() === "") continue;
      const translation = translate(scalar.value);
      if (translation === undefined) {
        untranslated++;
        if (options.untranslated === "omit" && scalar.removable) {
          edits.push({ start: scalar.entryStart, end: scalar.entryEnd, text: "" });
        }
        continue;
      }
      translated++;
      edits.push({
        start: scalar.start,
        end: scalar.end,
        text: encodeYamlScalar(translation, scalar, options.asciiOnly, eol),
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

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this pattern looks for
const CONTROL = /[\u{0}-\u{8}\u{b}\u{c}\u{e}-\u{1f}\u{7f}-\u{9f}\u{2028}\u{2029}\u{feff}]/u;
const NON_ASCII = /\P{ASCII}/u;

/** A translation written for the place of a scalar, in its style when possible. */
export function encodeYamlScalar(value: string, scalar: YamlScalar, asciiOnly: boolean, eol: string): string {
  const keepsChars = !CONTROL.test(value) && !(asciiOnly && NON_ASCII.test(value));
  if (keepsChars && (scalar.style === "literal" || scalar.style === "folded")) {
    const block = encodeBlock(value, scalar, eol);
    if (block !== undefined) return block;
  }
  if (keepsChars && !value.includes("\n")) {
    if (scalar.style === "plain" && isPlainSafe(value, scalar.inFlow)) return value;
    if (scalar.style === "single") return `'${value.replaceAll("'", "''")}'`;
  }
  return encodeDouble(value, asciiOnly);
}

/**
 * A block scalar with the header of the source: its chomping decides the final line breaks, so those of the
 * translation are dropped. A folded block can only hold one line without re-wrapping it: a translation with line
 * breaks becomes a literal block. Undefined when a block cannot hold the translation.
 */
function encodeBlock(value: string, scalar: YamlScalar, eol: string): string | undefined {
  const header = scalar.header ?? "|";
  if (header.includes("+")) return undefined; // kept final line breaks: their number must match exactly
  const body = value.replace(/\n+$/, "");
  if (body === "" || /^[ \t]/.test(body)) return undefined; // a leading space would need an indentation indicator
  const literal = scalar.style === "literal" || body.includes("\n");
  const written = literal ? header.replace(">", "|") : header;
  const indent = " ".repeat(scalar.contentIndent ?? scalar.indent + 2);
  const lines = body.split("\n").map((line) => (line === "" ? "" : indent + line));
  return [written, ...lines].join(eol);
}

/** Whether a plain scalar would read back as this very string. */
function isPlainSafe(value: string, inFlow: boolean): boolean {
  if (value === "" || value !== value.trim() || NOT_TEXT.test(value)) return false;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return false; // indicators that start something else
  if (value.includes(": ") || value.includes(" #") || value.endsWith(":")) return false;
  return !(inFlow && /[,[\]{}]/.test(value));
}

const DOUBLE_ESCAPES: Readonly<Record<string, string>> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\t": "\\t",
  "\r": "\\r",
};

function encodeDouble(value: string, asciiOnly: boolean): string {
  let encoded = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const escaped = DOUBLE_ESCAPES[char];
    if (escaped !== undefined) encoded += escaped;
    else if (CONTROL.test(char) || (asciiOnly && code > 0x7f)) encoded += hexEscape(code);
    else encoded += char;
  }
  return `"${encoded}"`;
}

function hexEscape(code: number): string {
  if (code < 0x80) return `\\x${code.toString(16).padStart(2, "0")}`;
  if (code <= 0xffff) return `\\u${code.toString(16).padStart(4, "0")}`;
  return `\\U${code.toString(16).padStart(8, "0")}`;
}
