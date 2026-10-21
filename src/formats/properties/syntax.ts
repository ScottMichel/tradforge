import { stripBom } from "../../core/reader.js";

/**
 * Java .properties files (ResourceBundle, Spring messages):
 *
 *   # Title of the main window
 *   app.name = The Cold Forge
 *   welcome=Welcome back, {0}!
 *   long: A text \
 *       on two lines
 *
 * A key ends at the first unescaped "=", ":" or space; a line that ends with an odd number of backslashes goes on
 * over the next one. Escapes: \t \n \r \f \uXXXX, and any other character after a backslash stands for itself.
 * Unlike most formats, a .properties file never fails to parse: Java reads anything, so this reader does too.
 */

export interface PropertiesEntry {
  readonly key: string;
  readonly value: string;
  /** The comment lines just above the entry, without blank line between. */
  readonly comment?: string;
  /** 1-based line of the key. */
  readonly line: number;
  /** Offsets of the value as written, continuation lines included (last line end excluded). */
  readonly start: number;
  readonly end: number;
  /** Offsets of the entry's lines, line end included: for omit. */
  readonly entryStart: number;
  readonly entryEnd: number;
}

interface Line {
  readonly text: string;
  readonly start: number;
  readonly next: number;
}

const ESCAPES: Readonly<Record<string, string>> = { t: "\t", n: "\n", r: "\r", f: "\f" };

/** Parses a .properties file (offsets relative to the text without byte order mark). */
export function parseProperties(content: string): PropertiesEntry[] {
  const text = stripBom(content);
  const lines: Line[] = [];
  for (let start = 0; start < text.length; ) {
    const newline = text.indexOf("\n", start);
    const next = newline === -1 ? text.length : newline + 1;
    lines.push({ text: text.slice(start, next).replace(/\r?\n$/, ""), start, next });
    start = next;
  }

  const entries: PropertiesEntry[] = [];
  let comment: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as Line;
    const trimmed = line.text.trimStart();
    if (trimmed === "") {
      comment = [];
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith("!")) {
      comment.push(trimmed.slice(1).trim());
      continue;
    }

    // The logical line: physical lines joined while one ends with an odd number of backslashes.
    const first = index;
    let logical = trimmed;
    // offsets[i]: where logical[i] is in the text, so that the writer can replace the value in place.
    const firstStart = line.start + (line.text.length - trimmed.length);
    let offsets = Array.from({ length: trimmed.length }, (_unit, i) => firstStart + i);
    while (endsWithContinuation(logical) && index + 1 < lines.length) {
      index++;
      const following = lines[index] as Line;
      const rest = following.text.trimStart();
      logical = logical.slice(0, -1);
      offsets = offsets.slice(0, logical.length);
      const restStart = following.start + (following.text.length - rest.length);
      for (let i = 0; i < rest.length; i++) offsets.push(restStart + i);
      logical += rest;
    }
    const last = lines[index] as Line;
    const lineEnd = last.start + last.text.length;

    const { key, valueAt } = splitKey(logical);
    const valueRaw = logical.slice(valueAt);
    entries.push({
      key,
      value: decode(valueRaw),
      ...(comment.length > 0 ? { comment: comment.join(" ") } : {}),
      line: first + 1,
      start: offsets[valueAt] ?? lineEnd,
      end: lineEnd,
      entryStart: line.start,
      entryEnd: last.next,
    });
    comment = [];
  }
  return entries;
}

function endsWithContinuation(text: string): boolean {
  const backslashes = /\\*$/.exec(text)?.[0].length ?? 0;
  return backslashes % 2 === 1;
}

/** The key (decoded) and where the value starts: after the separator and the spaces around it. */
function splitKey(logical: string): { key: string; valueAt: number } {
  let i = 0;
  while (i < logical.length) {
    const char = logical.charAt(i);
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === "=" || char === ":" || char === " " || char === "\t" || char === "\f") break;
    i++;
  }
  const key = decode(logical.slice(0, i));
  while (i < logical.length && /[ \t\f]/.test(logical.charAt(i))) i++;
  if (logical.charAt(i) === "=" || logical.charAt(i) === ":") i++;
  while (i < logical.length && /[ \t\f]/.test(logical.charAt(i))) i++;
  return { key, valueAt: i };
}

function decode(raw: string): string {
  return raw.replace(/\\(?:u([0-9a-fA-F]{4})|(.))/gs, (_match, hex: string | undefined, char: string) =>
    hex !== undefined ? String.fromCharCode(Number.parseInt(hex, 16)) : (ESCAPES[char] ?? char),
  );
}

/**
 * A text with numbered arguments ({0}, {1,number}) goes through MessageFormat, which reads '' as one apostrophe and a
 * lone ' as the start of quoted text.
 */
export function isMessageFormat(value: string): boolean {
  return /\{\d+(?:,[^{}]*)?\}/.test(value);
}

/** A value as Java reads it back: backslashes, line breaks and a leading space escaped; with asciiOnly, \uXXXX. */
export function encodePropertiesValue(value: string, asciiOnly: boolean): string {
  let encoded = "";
  for (let i = 0; i < value.length; i++) {
    const char = value.charAt(i);
    const code = value.charCodeAt(i);
    if (char === "\\") encoded += "\\\\";
    else if (char === "\n") encoded += "\\n";
    else if (char === "\r") encoded += "\\r";
    else if (char === "\t") encoded += "\\t";
    else if (char === "\f") encoded += "\\f";
    else if (char === " " && encoded === "") encoded += "\\ ";
    else if (code < 0x20 || (asciiOnly && code > 0x7e)) encoded += `\\u${code.toString(16).padStart(4, "0")}`;
    else encoded += char;
  }
  return encoded;
}
