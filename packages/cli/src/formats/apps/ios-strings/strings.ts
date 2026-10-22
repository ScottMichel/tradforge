import { ReadError, stripBom } from "../../../core/reader.js";

/**
 * The .strings files of Apple platforms (iOS, macOS), in <language>.lproj folders:
 *
 *   /* Title of the main window *\/
 *   "app_name" = "The Cold Forge";
 *   "welcome" = "Welcome back, %@!";    // a line comment
 *
 * The comment before an entry is the note of the developer. Keys may be quoted or bare; strings use the escapes of
 * old property lists: \" \\ \n \t \r, \U00E9 (one UTF-16 unit) and octal \101.
 */

export interface IosEntry {
  readonly key: string;
  readonly value: string;
  /** The comment just before the entry, unless Xcode's placeholder "No comment provided by engineer.". */
  readonly comment?: string;
  /** 1-based line of the value. */
  readonly line: number;
  /** Offsets of the value, quotes included. */
  readonly start: number;
  readonly end: number;
  /** Offsets of the entry with its comment and its line end, when they stand alone on their lines: for omit. */
  readonly entryStart: number;
  readonly entryEnd: number;
}

const XCODE_PLACEHOLDER = "No comment provided by engineer.";
const BARE_KEY = /[\w.$:/-]/;
const ESCAPES: Readonly<Record<string, string>> = { n: "\n", t: "\t", r: "\r", a: "\u{7}", b: "\b", f: "\f", v: "\v" };

/** Parses a .strings file (without byte order mark: offsets are relative to the text without it). */
export function parseIosStrings(file: string, content: string): IosEntry[] {
  const text = stripBom(content);
  const entries: IosEntry[] = [];
  let position = 0;
  let comment: { text: string; start: number } | undefined;
  // Read through a function: TypeScript does not see that skipBlanks sets the variable.
  const lastComment = () => comment;

  const lineAt = (offset: number) => text.slice(0, offset).split("\n").length;
  const fail = (offset: number, reason: string): never => {
    throw new ReadError(file, `line ${lineAt(offset)}: ${reason}`);
  };
  const skipSpaces = () => {
    while (position < text.length && /\s/.test(text.charAt(position))) position++;
  };
  /** Skips spaces and comments; returns the last comment met. */
  const skipBlanks = () => {
    for (;;) {
      skipSpaces();
      if (text.startsWith("/*", position)) {
        const close = text.indexOf("*/", position + 2);
        if (close === -1) fail(position, "unterminated comment");
        comment = { text: text.slice(position + 2, close).trim(), start: position };
        position = close + 2;
      } else if (text.startsWith("//", position)) {
        const newline = text.indexOf("\n", position);
        const end = newline === -1 ? text.length : newline;
        comment = { text: text.slice(position + 2, end).trim(), start: position };
        position = end;
      } else return;
    }
  };
  const quoted = (): string => {
    const open = position;
    let value = "";
    position++;
    for (;;) {
      if (position >= text.length) fail(open, "unterminated string");
      const char = text.charAt(position);
      if (char === '"') {
        position++;
        return value;
      }
      if (char !== "\\") {
        value += char;
        position++;
        continue;
      }
      const next = text.charAt(position + 1);
      const unicode = /^[Uu]([0-9a-fA-F]{4})/.exec(text.slice(position + 1, position + 6));
      const octal = /^[0-7]{1,3}/.exec(text.slice(position + 1, position + 4));
      if (unicode !== null) {
        value += String.fromCharCode(Number.parseInt(unicode[1] ?? "0", 16));
        position += 6;
      } else if (octal !== null) {
        value += String.fromCharCode(Number.parseInt(octal[0], 8));
        position += 1 + octal[0].length;
      } else {
        value += ESCAPES[next] ?? next;
        position += 2;
      }
    }
  };
  const token = (): string => {
    if (text.charAt(position) === '"') return quoted();
    const start = position;
    while (position < text.length && BARE_KEY.test(text.charAt(position))) position++;
    if (position === start) fail(position, "expected a key");
    return text.slice(start, position);
  };
  const expect = (char: string) => {
    skipBlanks();
    if (text.charAt(position) !== char) fail(position, `expected "${char}"`);
    position++;
  };

  for (;;) {
    comment = undefined;
    skipBlanks();
    if (position >= text.length) break;
    const keyStart = position;
    const before = lastComment();
    const key = token();
    expect("=");
    skipBlanks();
    if (text.charAt(position) !== '"') fail(position, "expected a quoted string");
    const start = position;
    const value = quoted();
    const end = position;
    expect(";");
    const note = before !== undefined && before.text !== XCODE_PLACEHOLDER ? before.text : undefined;
    const { entryStart, entryEnd } = entryRange(text, before?.start ?? keyStart, keyStart, position);
    entries.push({
      key,
      value,
      ...(note !== undefined && note !== "" ? { comment: note } : {}),
      line: lineAt(start),
      start,
      end,
      entryStart,
      entryEnd,
    });
  }
  return entries;
}

/**
 * The lines of an entry: from its comment (when only spaces lie between them) to its line end. Only when nothing
 * else shares those lines; otherwise just the entry itself.
 */
function entryRange(text: string, commentStart: number, keyStart: number, end: number) {
  const between = text.slice(commentStart, keyStart);
  const start = /^\/[*/][\s\S]*?(?:\*\/|\n)\s*$/.test(between) && !between.includes('"') ? commentStart : keyStart;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const after = /^[ \t]*(?:\r?\n|$)/.exec(text.slice(end))?.[0];
  if (!/^[ \t]*$/.test(text.slice(lineStart, start)) || after === undefined) {
    return { entryStart: keyStart, entryEnd: end };
  }
  return { entryStart: lineStart, entryEnd: end + after.length };
}

/** A quoted .strings value; with asciiOnly, every non-ASCII UTF-16 unit as \UXXXX. */
export function encodeIosString(text: string, asciiOnly: boolean): string {
  let encoded = "";
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    const code = text.charCodeAt(i);
    if (char === "\\") encoded += "\\\\";
    else if (char === '"') encoded += '\\"';
    else if (char === "\n") encoded += "\\n";
    else if (char === "\t") encoded += "\\t";
    else if (char === "\r") encoded += "\\r";
    else if (asciiOnly && code > 0x7f) encoded += `\\U${code.toString(16).toUpperCase().padStart(4, "0")}`;
    else encoded += char;
  }
  return `"${encoded}"`;
}
