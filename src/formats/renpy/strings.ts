/**
 * The two kinds of string literals of a Ren'Py script.
 * - Ren'Py strings (dialogue, menu choices) follow the Ren'Py lexer (renpy/lexer.py, string() and triple_string()):
 *   runs of spaces and line breaks collapse into one space, "\n" is a line break, "\{" "\[" "\%" become "{{" "[[" "%%"
 *   (still escaped for the text renderer), and any other escaped character stands for itself ("\t" is "t").
 * - Python strings (_("...") in $ lines, python blocks, define, screens) follow Python.
 */

/** How triple-quoted dialogue is split into lines of dialogue ("rpy monologue double|single|none"). */
export type MonologueMode = "double" | "single" | "none";

/** One line of dialogue of a triple-quoted string. */
export interface Paragraph {
  readonly value: string;
  /** Line of the paragraph, counted from the line where the literal starts. */
  readonly lineOffset: number;
}

// Like Python's ".", the final dot does not match a line break.
const RENPY_ESCAPE = /\\(u([0-9a-fA-F]{1,4})|.)/gu;

/** Ren'Py's dequote(): the escapes of dialogue strings. */
function renpyDequote(text: string): string {
  return text.replace(RENPY_ESCAPE, (_match, escaped: string, hex: string | undefined) => {
    if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (escaped === "u") return ""; // "\u" without digits: Ren'Py's dequote returns None, an empty replacement
    if (escaped === "{") return "{{";
    if (escaped === "[") return "[[";
    if (escaped === "%") return "%%";
    if (escaped === "n") return "\n";
    return escaped;
  });
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** The value of a single-, double- or backquoted Ren'Py string, from the text between its quotes. */
export function decodeRenpyString(body: string, raw: boolean): string {
  const text = normalizeNewlines(body);
  if (raw) return text;
  return renpyDequote(text.replace(/[ \n]+/g, " "));
}

/** The lines of dialogue of a triple-quoted Ren'Py string, exactly as Ren'Py's triple_string() splits them. */
export function splitMonologue(body: string, mode: MonologueMode): Paragraph[] {
  const text = normalizeNewlines(body).replace(/ *\n */g, "\n");
  const delimiter = mode === "double" ? "\n\n" : mode === "single" ? "\n" : undefined;
  const parts = delimiter === undefined ? [text] : text.split(delimiter);
  const paragraphs: Paragraph[] = [];
  let pos = 0;
  for (const part of parts) {
    const leading = part.length - part.trimStart().length;
    const lineOffset = countNewlines(text.slice(0, pos)) + countNewlines(part.slice(0, leading));
    pos += part.length + (delimiter?.length ?? 0);
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const collapsed = delimiter === undefined ? trimmed.replace(/ +/g, " ") : trimmed.replace(/[ \n]+/g, " ");
    paragraphs.push({ value: renpyDequote(collapsed), lineOffset });
  }
  return paragraphs;
}

function countNewlines(text: string): number {
  let count = 0;
  for (const char of text) if (char === "\n") count++;
  return count;
}

/** The escaped text of a Ren'Py string: Ren'Py's lexer turns it back into exactly `value`. */
function encodeRenpyBody(value: string, quote: string, asciiOnly: boolean, paragraph: boolean): string {
  let body = "";
  let previous = "";
  const chars = [...value];
  chars.forEach((char, index) => {
    const code = char.codePointAt(0) ?? 0;
    const atEnd = index === 0 || index === chars.length - 1;
    if (char === "\\") body += "\\\\";
    else if (char === quote) body += `\\${quote}`;
    else if (char === "\n") body += "\\n";
    else if (char === "\r") body += "";
    // The lexer strips the ends of paragraphs ("\ " would lose its space, not " "), and collapses runs of spaces.
    else if (char === " " && paragraph && atEnd) body += "\\u0020";
    else if (char === " " && previous === " ") body += "\\ ";
    // \u takes at most 4 digits: characters beyond the basic plane stay as they are (scripts are UTF-8 anyway).
    else if (asciiOnly && code > 0x7f && code <= 0xffff) body += `\\u${code.toString(16).padStart(4, "0")}`;
    else body += char;
    previous = char;
  });
  return body;
}

/** A single-line Ren'Py string literal for any text. */
export function encodeRenpyString(value: string, quote: string, asciiOnly: boolean): string {
  return quote + encodeRenpyBody(value, quote, asciiOnly, false) + quote;
}

/** A triple-quoted Ren'Py string literal holding these lines of dialogue. */
export function encodeRenpyTriple(
  paragraphs: readonly string[],
  quote: string,
  asciiOnly: boolean,
  newline: string,
  mode: MonologueMode,
): string {
  const delimiter = mode === "single" ? newline : newline + newline;
  const delimiters = quote.repeat(3);
  return delimiters + paragraphs.map((p) => encodeRenpyBody(p, quote, asciiOnly, true)).join(delimiter) + delimiters;
}

const PYTHON_ESCAPES = new Map([
  ["\\", "\\"],
  ["'", "'"],
  ['"', '"'],
  ["a", "\x07"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\v"],
  ["\n", ""],
]);

const PYTHON_ESCAPE = /\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|N\{|.)/gsu;

/**
 * The value of a Python string literal, from its prefix and the text between its quotes.
 * Undefined for what is not a plain text: f-strings, bytes, named escapes (\N{...}).
 */
export function decodePythonString(prefix: string, body: string): string | undefined {
  const lower = prefix.toLowerCase();
  if (lower.includes("f") || lower.includes("b")) return undefined;
  const text = normalizeNewlines(body);
  if (lower.includes("r")) return text;
  let supported = true;
  const value = text.replace(PYTHON_ESCAPE, (match, escaped: string) => {
    const simple = PYTHON_ESCAPES.get(escaped);
    if (simple !== undefined) return simple;
    const kind = escaped.charAt(0);
    if (escaped === "N{") supported = false;
    else if (kind === "x" || kind === "u" || kind === "U") {
      const code = Number.parseInt(escaped.slice(1), 16);
      if (code <= 0x10ffff) return String.fromCodePoint(code);
      supported = false;
    } else if (/^[0-7]/.test(escaped)) return String.fromCodePoint(Number.parseInt(escaped, 8));
    return match; // Python keeps unknown escapes as they are: "\q" is a backslash and a q
  });
  return supported ? value : undefined;
}

const PYTHON_WRITE_ESCAPES = new Map([
  ["\\", "\\\\"],
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\t", "\\t"],
]);

/** A Python string literal for any text, with the given quote. */
export function encodePythonString(value: string, quote: string, asciiOnly: boolean): string {
  let literal = quote;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const escaped = PYTHON_WRITE_ESCAPES.get(char);
    if (escaped !== undefined) literal += escaped;
    else if (char === quote) literal += `\\${quote}`;
    else if (code < 0x20 || code === 0x7f) literal += `\\x${code.toString(16).padStart(2, "0")}`;
    else if (asciiOnly && code > 0xffff) literal += `\\U${code.toString(16).padStart(8, "0")}`;
    else if (asciiOnly && code > 0x7f) literal += `\\u${code.toString(16).padStart(4, "0")}`;
    else literal += char;
  }
  return literal + quote;
}
