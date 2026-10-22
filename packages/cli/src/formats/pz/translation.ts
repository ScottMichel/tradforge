import { stripBom } from "../../core/reader.js";

/** One entry of a Build 41 translation table: Key = "Text", possibly continued on the next lines with "..". */
export interface PzEntry {
  readonly key: string;
  readonly value: string;
  /** Index of the first and the last line of the entry. */
  readonly start: number;
  readonly end: number;
  /** Position of the opening quote on the first line. */
  readonly firstQuote: number;
  /** What follows the closing quote on the last line: ",", ";", spaces, a comment. */
  readonly suffix: string;
}

export interface PzFile {
  readonly lines: readonly string[];
  /** The line break after each line ("" for the last one): written back as they were. */
  readonly endings: readonly string[];
  readonly entries: readonly PzEntry[];
  /** Index of the "UI_EN = {" line, if any. */
  readonly header: number | undefined;
}

/**
 * Reads a Project Zomboid Build 41 translation file (Translate/EN/UI_EN.txt) the way the game does: a text is
 * everything between the first and the last quote of its line, so unescaped quotes inside a text are fine.
 * Also accepted, as found in real mods: ";" or no separator, headers without "=", keys with spaces or brackets,
 * line comments ("--"), block comments, and texts continued on the next lines with "..".
 * Like the game, a line whose quotes do not pair up is not an entry: it is kept as it is, and the rest is read.
 */
export function parsePzTranslation(content: string): PzFile {
  const parts = stripBom(content).split(/(\r\n|\n|\r)/);
  const lines = parts.filter((_, index) => index % 2 === 0);
  const endings = lines.map((_, index) => parts[index * 2 + 1] ?? "");
  const entries: PzEntry[] = [];
  let header: number | undefined;
  let inComment = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (inComment) {
      inComment = !trimmed.includes("*/");
      continue;
    }
    if (trimmed.startsWith("/*")) {
      inComment = !trimmed.includes("*/", 2);
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("--")) continue;

    const firstQuote = line.indexOf('"');
    const equals = line.indexOf("=");
    if (firstQuote === -1) {
      if (header === undefined && trimmed.includes("{")) header = index;
      continue; // "{", "}" and other lines without a text
    }
    if (equals === -1 || equals > firstQuote) continue; // not an entry: left as it is

    const piece = quoted(line);
    if (piece === undefined) continue; // a broken line: left as it is
    let value = piece.text;
    let end = index;
    let rest = piece.after;
    while (rest.trimStart().startsWith("..")) {
      const next = quoted(lines[end + 1] ?? "");
      if (next === undefined) break; // a broken continuation ends the text
      end++;
      value += next.text;
      rest = next.after;
    }
    entries.push({ key: line.slice(0, equals).trim(), value, start: index, end, firstQuote, suffix: rest });
    index = end;
  }
  return { lines, endings, entries, header };
}

/** The text between the first and the last quote of a line, and what follows it; undefined if they do not pair up. */
function quoted(line: string): { text: string; after: string } | undefined {
  const first = line.indexOf('"');
  const last = line.lastIndexOf('"');
  if (first === -1 || last === first) return undefined;
  return { text: line.slice(first + 1, last), after: line.slice(last + 1) };
}
