import { ReadError, stripBom } from "../../core/reader.js";

/**
 * The localisation files of Paradox games (Crusader Kings, Europa Universalis, Hearts of Iron, Stellaris,
 * Victoria, Imperator) are line based, not general YAML:
 *
 *   l_english:
 *    # a comment
 *    event.1.t:0 "Text with $VARIABLE$ and §Ycolour§!" # another comment
 *
 * One header per language block, then one entry per line: a key, a colon, an optional version number, and the
 * text between double quotes, on one line.
 */

/** A language header such as "l_english:". `start`/`end` are the offsets of the name ("english") in the text. */
export interface ParadoxHeader {
  readonly kind: "header";
  readonly line: number;
  readonly language: string;
  readonly start: number;
  readonly end: number;
}

/** One entry. `start`/`end` are the offsets of the raw text between the quotes, `value` is the decoded text. */
export interface ParadoxEntry {
  readonly kind: "entry";
  readonly line: number;
  readonly key: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  /** Offsets of the whole line, line end included: to leave the entry out. */
  readonly lineStart: number;
  readonly lineEnd: number;
}

export type ParadoxItem = ParadoxHeader | ParadoxEntry;

/** "l_english:" with an optional comment. The name may hold underscores: "l_braz_por:", "l_simp_chinese:". */
const HEADER = /^[ \t]*l_([A-Za-z_]+)[ \t]*:[ \t]*(?:#.*)?$/;
/** " key:0 " up to the opening quote. Keys usually hold letters, digits, "_", "." and "-"; we accept more. */
const ENTRY_START = /^[ \t]*([^\s:"#]+):(\d*)[ \t]*"/;
/** What may follow the closing quote: spaces and a comment. */
const AFTER_TEXT = /^[ \t]*(?:#.*)?$/;
const COMMENT_OR_BLANK = /^[ \t]*(?:#.*)?$/;

/**
 * Parses a localisation file into its headers and entries, with offsets in the text without its byte order mark.
 * Throws a ReadError naming the file and the line on any line that is neither blank, a comment, a header nor an
 * entry, and when an entry comes before the first header.
 */
export function parseParadox(file: string, content: string): ParadoxItem[] {
  const text = stripBom(content);
  const items: ParadoxItem[] = [];
  let seenHeader = false;
  let lineStart = 0;
  let lineNumber = 0;

  while (lineStart < text.length || lineNumber === 0) {
    lineNumber++;
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd).replace(/\r?\n$/, "");
    const fail = (reason: string): never => {
      throw new ReadError(file, `line ${lineNumber}: ${reason}`);
    };

    const header = HEADER.exec(line);
    if (header !== null) {
      const language = header[1] ?? "";
      const start = lineStart + line.indexOf("l_") + 2;
      items.push({ kind: "header", line: lineNumber, language, start, end: start + language.length });
      seenHeader = true;
    } else if (!COMMENT_OR_BLANK.test(line)) {
      if (!seenHeader) fail('missing header (e.g. "l_english:")');
      const entry = ENTRY_START.exec(line);
      if (entry === null) fail("expected 'key:0 \"text\"'");
      const key = entry?.[1] ?? "";
      const opening = entry?.[0].length ?? 0;
      // Recent games accept unescaped quotes inside a text: the closing quote is the last one of the line.
      const closing = line.lastIndexOf('"');
      if (closing < opening) fail(`unterminated quote in "${key}"`);
      if (!AFTER_TEXT.test(line.slice(closing + 1))) fail(`unexpected text after the closing quote of "${key}"`);
      items.push({
        kind: "entry",
        line: lineNumber,
        key,
        value: decodeParadoxText(line.slice(opening, closing)),
        start: lineStart + opening,
        end: lineStart + closing,
        lineStart,
        lineEnd,
      });
    }
    lineStart = lineEnd;
  }
  if (!seenHeader) throw new ReadError(file, `line ${lineNumber}: missing header (e.g. "l_english:")`);
  return items;
}

/**
 * Raw text between the quotes → text: \n is a line break, \" a quote, \\ a backslash. Any other backslash is kept as
 * it is: the games have no other escape, and keeping it lets the writer give back the same bytes.
 */
export function decodeParadoxText(raw: string): string {
  return raw.replace(/\\([n"\\])/g, (_escape, char: string) => (char === "n" ? "\n" : char));
}

/**
 * Text → raw text for between the quotes, the inverse of decodeParadoxText. Quotes are always escaped (old game
 * versions require it, recent ones accept it), line breaks become \n, and a backslash is doubled only when it would
 * otherwise start an escape (before n, a quote, a backslash, a line break or the closing quote).
 */
export function encodeParadoxText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\(?=[n"\\\n]|$)/g, "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n");
}
