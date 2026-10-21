import { stripBom } from "../../core/reader.js";
import { parseYaml, type YamlScalar } from "../yaml/syntax.js";

/**
 * The texts of a Markdown document, block by block: headings (# and underlined), paragraphs, list items, quotes and
 * table cells, plus the title, description and summary of a YAML front matter (Hugo, Jekyll). Code (fenced or
 * indented), HTML blocks, thematic breaks and link definitions are not texts.
 *
 * A paragraph wrapped over several lines is one text, its lines joined by spaces: the translator writes it at its own
 * length. Only hard breaks (two spaces or a backslash at the end of a line) stay as line breaks.
 * Inline syntax (emphasis, links, `code`) stays in the text as it is written.
 */

export type MarkdownKind = "front-matter" | "heading" | "paragraph" | "item" | "quote" | "cell";

export interface MarkdownText {
  readonly kind: MarkdownKind;
  readonly value: string;
  /** Offsets of what the translation replaces, from the first character of the text to the last. */
  readonly start: number;
  readonly end: number;
  /** 1-based line where the text starts. */
  readonly line: number;
  /** 0 before the first heading, then one more at each heading: the texts of a section belong together. */
  readonly section: number;
  /** Written after each hard break, so that the next line stays in the quote or the list item. */
  readonly prefix: string;
  /** How the source writes a hard break: a backslash or two spaces. */
  readonly breakMarker: string;
  /** A front matter value, written back as YAML. */
  readonly scalar?: YamlScalar;
}

/** Front matter keys that hold texts for readers; the others are settings (layout, date, tags...). */
const FRONT_MATTER_TEXTS = new Set(["title", "description", "summary", "subtitle", "linkTitle", "excerpt"]);

interface Line {
  readonly text: string;
  readonly start: number;
  readonly number: number;
}

interface ParagraphLine {
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly content: string;
  /** The hard break that ends the line, if any. */
  readonly hardBreak?: string;
}

interface Paragraph {
  readonly kind: "paragraph" | "item" | "quote";
  readonly prefix: string;
  readonly line: number;
  readonly lines: ParagraphLine[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^( {0,3})(#{1,6})(?=\s|$)/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)\s*$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const HTML_BLOCK = /^ {0,3}<(?:[A-Za-z][\w-]*|\/[A-Za-z]|!--)/;
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S/;
const QUOTE = /^( {0,3}>\s?)/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\]\s+)?(?=\S)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

export function markdownTexts(file: string, content: string): MarkdownText[] {
  const text = stripBom(content);
  const lines: Line[] = [];
  for (let start = 0, number = 1; start < text.length; number++) {
    const newline = text.indexOf("\n", start);
    const next = newline === -1 ? text.length : newline + 1;
    lines.push({ text: text.slice(start, next).replace(/\r?\n$/, ""), start, number });
    start = next;
  }

  const texts: MarkdownText[] = [];
  let section = 0;
  let index = 0;
  let paragraph: Paragraph | undefined;
  let inList = false;

  const push = (
    kind: MarkdownKind,
    value: string,
    start: number,
    end: number,
    line: number,
    extra: Partial<MarkdownText> = {},
  ) => {
    if (value.trim() === "") return;
    texts.push({ kind, value, start, end, line, section, prefix: "", breakMarker: "  ", ...extra });
  };
  const flush = () => {
    if (paragraph === undefined) return;
    const { lines: parts } = paragraph;
    let value = "";
    let breakMarker: string | undefined;
    parts.forEach((part, i) => {
      value += part.content;
      if (i === parts.length - 1) return;
      if (part.hardBreak !== undefined) {
        breakMarker ??= part.hardBreak;
        value += "\n";
      } else value += " ";
    });
    const first = parts[0];
    const last = parts.at(-1);
    if (first !== undefined && last !== undefined) {
      push(paragraph.kind, value, first.contentStart, last.contentEnd, paragraph.line, {
        prefix: paragraph.prefix,
        breakMarker: breakMarker ?? "  ",
      });
    }
    paragraph = undefined;
  };
  /** The content of a line from a column: trailing spaces and hard break marker apart. */
  const partOf = (line: Line, column: number): ParagraphLine => {
    const raw = line.text.slice(column);
    const leading = raw.length - raw.trimStart().length;
    const body = raw.trimStart();
    const hard = /( {2,}|\\)$/.exec(body)?.[1];
    const content = (hard === "\\" ? body.slice(0, -1) : body).trimEnd();
    const contentStart = line.start + column + leading;
    return {
      content,
      contentStart,
      contentEnd: contentStart + content.length,
      ...(hard !== undefined ? { hardBreak: hard === "\\" ? "\\" : "  " } : {}),
    };
  };

  // Front matter: YAML between two --- lines at the very start.
  if (lines[0]?.text === "---") {
    const close = lines.findIndex((line, i) => i > 0 && (line.text === "---" || line.text === "..."));
    if (close > 0) {
      const start = lines[1]?.start ?? 0;
      const yaml = text.slice(start, lines[close]?.start ?? start);
      for (const scalar of parseYaml(file, yaml).scalars) {
        const key = scalar.path[0];
        if (scalar.path.length !== 1 || key === undefined || !FRONT_MATTER_TEXTS.has(key) || !scalar.isText) continue;
        push("front-matter", scalar.value, start + scalar.start, start + scalar.end, scalar.line + 1, { scalar });
      }
      index = close + 1;
    }
  }

  for (; index < lines.length; index++) {
    const line = lines[index] as Line;
    const raw = line.text;
    if (raw.trim() === "") {
      flush();
      continue;
    }

    const fence = FENCE.exec(raw)?.[1];
    if (fence !== undefined) {
      flush();
      const marker = fence.charAt(0);
      const closing = new RegExp(`^ {0,3}${marker === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
      while (index + 1 < lines.length && !closing.test((lines[index + 1] as Line).text)) index++;
      index++; // the closing fence
      continue;
    }
    if (paragraph?.kind === "paragraph" && SETEXT_UNDERLINE.test(raw)) {
      section++;
      flush(); // the paragraph above is a heading
      continue;
    }
    if (THEMATIC_BREAK.test(raw)) {
      flush();
      continue;
    }
    const heading = ATX_HEADING.exec(raw);
    if (heading !== null) {
      flush();
      section++;
      inList = false;
      const part = partOf(line, (heading[0] ?? "").length);
      const content = part.content.replace(/\s+#+$/, "").replace(/^#+$/, "");
      push("heading", content, part.contentStart, part.contentStart + content.length, line.number);
      continue;
    }
    if (paragraph === undefined && HTML_BLOCK.test(raw)) {
      const comment = /^ {0,3}<!--/.test(raw);
      while (index + 1 < lines.length) {
        if (comment ? (lines[index] as Line).text.includes("-->") : (lines[index + 1] as Line).text.trim() === "")
          break;
        index++;
      }
      continue;
    }
    if (paragraph === undefined && LINK_DEFINITION.test(raw)) continue;

    const next = lines[index + 1];
    if (raw.includes("|") && next !== undefined && TABLE_SEPARATOR.test(next.text) && next.text.includes("-")) {
      flush();
      inList = false;
      pushCells(line);
      index++; // the separator row
      while (
        index + 1 < lines.length &&
        (lines[index + 1] as Line).text.includes("|") &&
        (lines[index + 1] as Line).text.trim() !== ""
      ) {
        index++;
        pushCells(lines[index] as Line);
      }
      continue;
    }

    const quote = QUOTE.exec(raw)?.[1];
    if (quote !== undefined) {
      if (paragraph !== undefined && paragraph.kind !== "quote") flush();
      const part = partOf(line, quote.length);
      if (part.content === "") {
        flush();
        continue;
      }
      paragraph ??= { kind: "quote", prefix: "> ", line: line.number, lines: [] };
      paragraph.lines.push(part);
      continue;
    }

    const item = LIST_ITEM.exec(raw);
    if (item !== null) {
      flush();
      inList = true;
      const column = item[0].length;
      const width = (item[1] ?? "").length + (item[2] ?? "").length + (item[3] ?? "").length;
      paragraph = { kind: "item", prefix: " ".repeat(width), line: line.number, lines: [partOf(line, column)] };
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    if (paragraph === undefined && !inList && (indent >= 4 || raw.startsWith("\t"))) continue; // indented code

    if (paragraph !== undefined) {
      paragraph.lines.push(partOf(line, 0)); // a continuation line, lazy or indented
      continue;
    }
    if (indent === 0) inList = false;
    paragraph = {
      kind: "paragraph",
      prefix: " ".repeat(inList ? indent : 0),
      line: line.number,
      lines: [partOf(line, 0)],
    };
  }
  flush();
  return texts;

  function pushCells(row: Line): void {
    const textOfRow = row.text;
    let cellStart = 0;
    let inCode = false;
    const cells: [number, number][] = [];
    for (let i = 0; i <= textOfRow.length; i++) {
      const char = textOfRow.charAt(i);
      if (char === "`") inCode = !inCode;
      if (char === "\\") {
        i++;
        continue;
      }
      if ((char === "|" && !inCode) || i === textOfRow.length) {
        cells.push([cellStart, i]);
        cellStart = i + 1;
      }
    }
    for (const [from, to] of cells) {
      const cell = textOfRow.slice(from, to);
      const value = cell.trim();
      const offset = row.start + from + (cell.length - cell.trimStart().length);
      push("cell", value, offset, offset + value.length, row.number);
    }
  }
}
