import { ReadError, stripBom } from "../../../core/reader.js";

/**
 * Gettext catalogs (.po, and .pot templates) are line based:
 *
 *   #. a note for translators          (extracted comment)
 *   #: src/main.c:12                   (reference)
 *   #, fuzzy, c-format                 (flags)
 *   #| msgid "previous text"           (previous text, after an update)
 *   msgctxt "menu"
 *   msgid "One file"
 *   msgid_plural "%d files"
 *   msgstr[0] ""
 *   msgstr[1] ""
 *
 * A string may go on over the next lines, one quoted piece per line. Entries are separated by blank lines; the
 * first one, with an empty msgid, is the header. Lines starting with "#~" keep obsolete entries: they are comments.
 */

/** A comment line of an entry. `start`/`next`: from the start of the line to the start of the next one. */
export interface PoCommentLine {
  /** The character after "#": "." extracted, ":" reference, "," flags, "|" previous, " " translator. */
  readonly kind: string;
  readonly start: number;
  readonly next: number;
}

/** One msgstr, or one msgstr[n] of a plural entry. */
export interface PoTranslation {
  readonly index?: number;
  readonly value: string;
}

export interface PoEntry {
  /** 1-based line of the msgid keyword. */
  readonly line: number;
  readonly context?: string;
  readonly id: string;
  readonly plural?: string;
  readonly pluralLine?: number;
  readonly translations: readonly PoTranslation[];
  /** Extracted comments (#.), the notes of the developers. */
  readonly comments: readonly string[];
  /** Flags (#,), such as fuzzy or c-format. */
  readonly flags: readonly string[];
  readonly commentLines: readonly PoCommentLine[];
  /** Offsets of the entry: from its first comment to the end of its last line, line end excluded. */
  readonly start: number;
  readonly end: number;
  /** Offsets of the msgstr lines, continuation lines included, last line end excluded. */
  readonly translationStart: number;
  readonly translationEnd: number;
}

const KEYWORD = /^(msgctxt|msgid_plural|msgid|msgstr)(?:\[(\d+)\])?[ \t]+(".*)$/;
const CONTINUATION = /^[ \t]*(".*)$/;
/** A quoted string, then nothing but spaces. */
const QUOTED = /^"((?:[^"\\]|\\.)*)"[ \t]*$/;

interface Draft {
  start: number;
  end: number;
  line: number;
  context?: string;
  id?: string;
  plural?: string;
  pluralLine?: number;
  translations: { index?: number; value: string }[];
  comments: string[];
  flags: string[];
  commentLines: PoCommentLine[];
  translationStart: number;
  translationEnd: number;
  /** The string that continuation lines extend. */
  last?: "context" | "id" | "plural" | "translation";
}

/**
 * Parses a catalog into its entries, with offsets in the text without its byte order mark.
 * Throws a ReadError naming the file and the line on anything else than an entry, a comment or a blank line.
 */
export function parsePo(file: string, content: string): PoEntry[] {
  const text = stripBom(content);
  const entries: PoEntry[] = [];
  let draft: Draft | undefined;
  let lineStart = 0;
  let lineNumber = 0;

  const fail = (line: number, reason: string): never => {
    throw new ReadError(file, `line ${line}: ${reason}`);
  };
  const newDraft = (start: number): Draft => ({
    start,
    end: start,
    line: 0,
    translations: [],
    comments: [],
    flags: [],
    commentLines: [],
    translationStart: 0,
    translationEnd: 0,
  });
  const finish = () => {
    if (draft === undefined) return;
    if (draft.id === undefined) {
      if (draft.translations.length > 0) fail(draft.line, "msgstr without msgid");
    } else {
      if (draft.translations.length === 0) fail(draft.line, "msgid without msgstr");
      entries.push(toEntry(draft, draft.id));
    }
    draft = undefined;
  };

  while (lineStart < text.length) {
    lineNumber++;
    const newline = text.indexOf("\n", lineStart);
    const next = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, next).replace(/\r?\n$/, "");
    const lineEnd = lineStart + line.length;
    const trimmed = line.trim();

    if (trimmed === "") {
      finish();
    } else if (trimmed.startsWith("#~")) {
      finish(); // an obsolete entry: kept as it is, never translated
    } else if (trimmed.startsWith("#")) {
      if (draft !== undefined && (draft.id !== undefined || draft.translations.length > 0)) finish();
      draft ??= newDraft(lineStart);
      const kind = trimmed.charAt(1) || " ";
      const body = trimmed.slice(2).trim();
      draft.commentLines.push({ kind, start: lineStart, next });
      if (kind === ".") draft.comments.push(body);
      if (kind === ",")
        draft.flags.push(
          ...body
            .split(",")
            .map((flag) => flag.trim())
            .filter((flag) => flag !== ""),
        );
      draft.end = lineEnd;
    } else {
      const keyword = KEYWORD.exec(trimmed);
      const continuation = keyword === null ? CONTINUATION.exec(trimmed) : null;
      if (keyword === null && (continuation === null || draft?.last === undefined)) fail(lineNumber, "unexpected line");
      const value = quoted(keyword?.[3] ?? continuation?.[1] ?? "", () => fail(lineNumber, "unterminated string"));

      if (keyword === null) {
        appendTo(draft as Draft, value);
      } else {
        const name = keyword[1];
        // msgctxt or msgid after the translations of an entry: a new entry, without a blank line between
        if ((name === "msgctxt" || name === "msgid") && draft !== undefined && draft.translations.length > 0) finish();
        draft ??= newDraft(lineStart);
        if (name === "msgctxt") {
          draft.context = value;
          draft.last = "context";
        } else if (name === "msgid") {
          draft.id = value;
          draft.line = lineNumber;
          draft.last = "id";
        } else if (name === "msgid_plural") {
          draft.plural = value;
          draft.pluralLine = lineNumber;
          draft.last = "plural";
        } else {
          if (draft.id === undefined) fail(lineNumber, "msgstr without msgid");
          if (draft.translations.length === 0) draft.translationStart = lineStart;
          const index = keyword[2];
          draft.translations.push({ ...(index !== undefined ? { index: Number(index) } : {}), value });
          draft.last = "translation";
        }
        if (draft.line === 0) draft.line = lineNumber;
      }
      if (draft !== undefined) {
        if (draft.last === "translation") draft.translationEnd = lineEnd;
        draft.end = lineEnd;
      }
    }
    lineStart = next;
  }
  finish();
  return entries;
}

function quoted(raw: string, fail: () => never): string {
  const match = QUOTED.exec(raw);
  return match === null ? fail() : decodePoString(match[1] ?? "");
}

function appendTo(draft: Draft, value: string): void {
  if (draft.last === "context") draft.context = (draft.context ?? "") + value;
  else if (draft.last === "id") draft.id = (draft.id ?? "") + value;
  else if (draft.last === "plural") draft.plural = (draft.plural ?? "") + value;
  else {
    const last = draft.translations.at(-1);
    if (last !== undefined) last.value += value;
  }
}

function toEntry(draft: Draft, id: string): PoEntry {
  return {
    line: draft.line,
    ...(draft.context !== undefined ? { context: draft.context } : {}),
    id,
    ...(draft.plural !== undefined ? { plural: draft.plural, pluralLine: draft.pluralLine ?? draft.line } : {}),
    translations: draft.translations,
    comments: draft.comments,
    flags: draft.flags,
    commentLines: draft.commentLines,
    start: draft.start,
    end: draft.end,
    translationStart: draft.translationStart,
    translationEnd: draft.translationEnd,
  };
}

const DECODED: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  a: "\u{7}",
  b: "\b",
  f: "\f",
  v: "\v",
};

/** The text of a quoted piece, without its quotes: C escapes (\n, \", \\, \101, \x41) decoded. */
export function decodePoString(raw: string): string {
  return raw.replace(/\\(?:([0-7]{1,3})|x([0-9A-Fa-f]{1,2})|(.))/gs, (_match, octal, hex, char: string) => {
    if (octal !== undefined) return String.fromCharCode(Number.parseInt(octal, 8));
    if (hex !== undefined) return String.fromCharCode(Number.parseInt(hex, 16));
    return DECODED[char] ?? char; // \" and \\, and any unknown escape, give the character itself
  });
}

const ENCODED: Readonly<Record<string, string>> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\t": "\\t", "\r": "\\r" };

function escapeString(text: string): string {
  return text.replace(/[\\"\n\t\r]/g, (char) => ENCODED[char] ?? char);
}

/**
 * A keyword and its string ('msgstr "Bonjour"'). A text with a line break before its end goes on one quoted line per
 * line, after an empty first one, as gettext writes it.
 */
export function encodePoString(keyword: string, text: string, eol: string): string {
  const breakAt = text.indexOf("\n");
  if (breakAt === -1 || breakAt === text.length - 1) return `${keyword} "${escapeString(text)}"`;
  const pieces = text.match(/[^\n]*\n|[^\n]+/g) ?? [];
  return [`${keyword} ""`, ...pieces.map((piece) => `"${escapeString(piece)}"`)].join(eol);
}
