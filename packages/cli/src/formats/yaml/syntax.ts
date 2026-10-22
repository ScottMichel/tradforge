import { ReadError, stripBom } from "../../core/reader.js";

/**
 * The part of YAML that translation files use (Rails, Symfony, i18next, Hugo...):
 *
 *   en:
 *     title: The Cold Forge            plain, 'single' or "double" quoted strings, on one or several lines
 *     intro: |                         block scalars, literal (|) or folded (>), with chomping (- +)
 *       First line
 *     days: [Sunday, Monday]           flow sequences, on one line
 *     steps:
 *       - Light the fire               block sequences, of strings or of mappings
 *
 * Anchors, aliases, tags, flow mappings and complex keys are refused with a clear message: a reader that guessed
 * would write a broken file. Every value keeps its offsets, so that a writer can replace it in place.
 */

export type YamlStyle = "plain" | "single" | "double" | "literal" | "folded";

export interface YamlScalar {
  /** Keys and sequence indexes from the root: ["en", "days", "0"]. */
  readonly path: readonly string[];
  /** The decoded value. */
  readonly value: string;
  /** False for what YAML reads as another type: true, no, null, 42, 2024-01-01... and for empty strings. */
  readonly isText: boolean;
  readonly style: YamlStyle;
  /** 1-based line where the value starts. */
  readonly line: number;
  /** Offsets of the value as written (quotes included; for a block scalar, from its header to its last line). */
  readonly start: number;
  readonly end: number;
  /** Column of the mapping key or sequence dash that holds the value. */
  readonly indent: number;
  /** Block scalars: the header as written ("|", ">-", "|+2") and the indentation of their lines. */
  readonly header?: string;
  readonly contentIndent?: number;
  /** An item of a flow sequence ([a, b]): its value cannot hold "," "[" "]" unquoted. */
  readonly inFlow: boolean;
  /**
   * The whole "key: value" entry, line end included, for a mapping value alone on its lines: a writer may leave it
   * out. Equal to start/end otherwise (a sequence item cannot be left out without shifting the next ones).
   */
  readonly entryStart: number;
  readonly entryEnd: number;
  readonly removable: boolean;
}

export interface YamlKey {
  readonly value: string;
  /** Offsets of the key as written, quotes excluded. */
  readonly start: number;
  readonly end: number;
}

export interface YamlDocument {
  readonly scalars: readonly YamlScalar[];
  /** The single root key named after the source language, as Rails files have it ("en:"). */
  readonly languageKey?: YamlKey;
}

interface Line {
  readonly number: number;
  readonly start: number;
  /** The line without its line end. */
  readonly text: string;
  readonly indent: number;
  /** Offset of the next line. */
  readonly next: number;
}

/** A place to read from: a line, and the column where its content starts (inside "- key: value", the key). */
interface Position {
  readonly index: number;
  readonly column: number;
}

/** What YAML 1.1 (Ruby, many tools) and 1.2 read as booleans, null, numbers or dates rather than strings. */
export const NOT_TEXT =
  /^(?:~|null|true|false|yes|no|on|off|y|n|[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[-+]?\d+)?|0x[\da-f_]+|0o?[0-7_]+|0b[01_]+|[-+]?\.(?:inf|nan)|\d{4}-\d\d?-\d\d?(?:[t ].*)?)$/i;

const BLOCK_HEADER = /^([|>])([+-]?)(\d?)([+-]?)(?=[ \t]|$)/;

const ESCAPES: Readonly<Record<string, string>> = {
  "0": "\u{0}",
  a: "\u{7}",
  b: "\b",
  t: "\t",
  "\t": "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\u{1b}",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u{85}",
  _: "\u{a0}",
  L: "\u{2028}",
  P: "\u{2029}",
};

/**
 * Parses a YAML document. With the source language, a single root key named after it ("en", "en-US") is reported
 * as languageKey. Throws a ReadError naming the file and the line on anything it does not support.
 */
export function parseYaml(file: string, content: string, sourceLanguage?: string): YamlDocument {
  const parser = new Parser(file, stripBom(content));
  const scalars = parser.document();
  const keys = parser.rootKeys;
  const only = keys.length === 1 ? keys[0] : undefined;
  const languageKey =
    only !== undefined && sourceLanguage !== undefined && sameLanguage(only.value, sourceLanguage) ? only : undefined;
  return { scalars, ...(languageKey !== undefined ? { languageKey } : {}) };
}

function sameLanguage(key: string, language: string): boolean {
  const normal = (code: string) => code.toLowerCase().replace(/_/g, "-");
  const [base] = normal(key).split("-");
  return normal(key) === normal(language) || base === normal(language);
}

class Parser {
  readonly rootKeys: YamlKey[] = [];
  private readonly lines: Line[] = [];
  private readonly scalars: YamlScalar[] = [];
  /** The next line to read. */
  private index = 0;
  /** A position inside the current line, set when a mapping starts after "- ". */
  private pending: Position | undefined;
  /** The last line a value was read from: the end of its entry. */
  private lastConsumed = 0;

  constructor(
    private readonly file: string,
    private readonly text: string,
  ) {
    let start = 0;
    let number = 0;
    while (start < text.length) {
      number++;
      const newline = text.indexOf("\n", start);
      const next = newline === -1 ? text.length : newline + 1;
      const line = text.slice(start, next).replace(/\r?\n$/, "");
      const indent = line.length - line.replace(/^ +/, "").length;
      this.lines.push({ number, start, text: line, indent, next });
      start = next;
    }
  }

  document(): YamlScalar[] {
    const first = this.peek();
    if (first !== undefined) {
      this.block(first.column, []);
      const extra = this.peek();
      if (extra !== undefined) this.fail(extra.index, "unexpected indentation");
    }
    return this.scalars;
  }

  /** The next line with content (blank lines, comments and document markers skipped). */
  private peek(): Position | undefined {
    if (this.pending !== undefined) return this.pending;
    while (this.index < this.lines.length) {
      const line = this.line(this.index);
      const content = line.text.trim();
      const marker = /^(?:---|\.\.\.)(?:\s.*)?$/.test(content) || content.startsWith("%");
      if (content !== "" && !content.startsWith("#") && !marker) {
        if (/^ *\t/.test(line.text)) this.fail(this.index, "tabs cannot indent YAML");
        return { index: this.index, column: line.indent };
      }
      this.index++;
    }
    return undefined;
  }

  /** Marks a line as read: the next peek starts after it. */
  private consume(index: number): void {
    this.pending = undefined;
    this.index = index + 1;
    this.lastConsumed = index;
  }

  private block(indent: number, path: readonly string[]): void {
    const position = this.peek();
    if (position === undefined) return;
    if (this.isSequenceItem(position)) this.sequence(indent, path);
    else this.mapping(indent, path);
  }

  private mapping(indent: number, path: readonly string[]): void {
    for (let position = this.peek(); position !== undefined; position = this.peek()) {
      if (position.column < indent) return;
      if (position.column > indent) this.fail(position.index, "unexpected indentation");
      if (this.isSequenceItem(position)) this.fail(position.index, "unexpected list item");

      const line = this.line(position.index);
      const key = this.key(position);
      if (path.length === 0) this.rootKeys.push(key.key);
      const removable = position.column === line.indent;
      this.consume(position.index);
      const before = this.scalars.length;
      this.value(position.index, key.valueColumn, indent, [...path, key.key.value], "mapping");
      if (removable && this.scalars.length === before + 1) {
        // A scalar value: its entry runs from the start of the key line to the end of the value's last line.
        const scalar = this.scalars[before];
        if (scalar !== undefined && scalar.path.length === path.length + 1 && !scalar.inFlow) {
          const entryEnd = this.line(this.lastConsumed).next;
          this.scalars[before] = { ...scalar, entryStart: line.start, entryEnd, removable: true };
        }
      }
    }
  }

  private sequence(indent: number, path: readonly string[]): void {
    let item = 0;
    for (let position = this.peek(); position !== undefined; position = this.peek()) {
      if (position.column < indent) return;
      if (position.column > indent) this.fail(position.index, "unexpected indentation");
      if (!this.isSequenceItem(position)) return; // a key of the mapping that holds the sequence
      const text = this.line(position.index).text;
      let column = position.column + 1;
      while (text.charAt(column) === " ") column++;
      this.consume(position.index);
      this.value(position.index, column, indent, [...path, String(item)], "sequence");
      item++;
    }
  }

  /** Reads the value that starts at a column of a line, after a key or a dash. */
  private value(index: number, column: number, parentIndent: number, path: string[], holder: "mapping" | "sequence") {
    const text = this.line(index).text;
    const rest = text.slice(column);
    const first = rest.charAt(0);

    if (rest === "" || first === "#") {
      const next = this.peek();
      if (next === undefined) return;
      if (next.column > parentIndent) this.block(next.column, path);
      // A sequence may sit at the indentation of its key ("steps:\n- one").
      else if (next.column === parentIndent && holder === "mapping" && this.isSequenceItem(next)) {
        this.sequence(parentIndent, path);
      }
      return;
    }
    if (first === "&" || first === "*" || first === "!")
      this.fail(index, "anchors, aliases and tags are not supported");
    if (first === "|" || first === ">") return this.blockScalar(index, column, parentIndent, path);
    if (first === '"' || first === "'") return this.quoted(index, column, parentIndent, path);
    if (first === "[") return this.flowSequence(index, column, parentIndent, path);
    if (first === "{") {
      if (/^\{\s*\}\s*(?:#.*)?$/.test(rest)) return;
      this.fail(index, "flow mappings are not supported");
    }
    if (holder === "sequence" && this.findColon(text, column) !== undefined) {
      // "- key: value": a mapping that starts after the dash.
      this.pending = { index, column };
      this.index = index;
      this.mapping(column, path);
      return;
    }
    this.plain(index, column, parentIndent, path);
  }

  private key(position: Position): { key: YamlKey; valueColumn: number } {
    const line = this.line(position.index);
    const text = line.text;
    const quote = text.charAt(position.column);
    if (text.startsWith("? ", position.column)) this.fail(position.index, "complex keys are not supported");
    let colon: number | undefined;
    let key: YamlKey;
    if (quote === '"' || quote === "'") {
      const close = closingQuote(text, position.column);
      if (close === undefined) this.fail(position.index, "unterminated string");
      const raw = text.slice(position.column + 1, close);
      const value = quote === '"' ? this.decodeDouble(raw, position.index) : raw.replaceAll("''", "'");
      key = { value, start: line.start + position.column + 1, end: line.start + (close ?? 0) };
      let after = (close ?? 0) + 1;
      while (text.charAt(after) === " ") after++;
      if (text.charAt(after) === ":") colon = after;
    } else {
      colon = this.findColon(text, position.column);
      const raw = text.slice(position.column, colon).trimEnd();
      key = { value: raw, start: line.start + position.column, end: line.start + position.column + raw.length };
    }
    if (colon === undefined) return this.fail(position.index, 'expected "key: value"');
    let valueColumn = colon + 1;
    while (text.charAt(valueColumn) === " ") valueColumn++;
    return { key, valueColumn };
  }

  /** The colon that ends a plain key: followed by a space or the line end, before any comment. */
  private findColon(text: string, from: number): number | undefined {
    if (text.charAt(from) === '"' || text.charAt(from) === "'") {
      const close = closingQuote(text, from);
      if (close === undefined) return undefined;
      const after = /^ *:(?= |$)/.exec(text.slice(close + 1));
      return after === null ? undefined : close + after[0].length;
    }
    for (let i = from; i < text.length; i++) {
      const char = text.charAt(i);
      if (char === "#" && (i === from || text.charAt(i - 1) === " ")) return undefined;
      if (char === ":" && (i + 1 === text.length || text.charAt(i + 1) === " ")) return i;
    }
    return undefined;
  }

  private plain(index: number, column: number, parentIndent: number, path: string[]): void {
    const line = this.line(index);
    let value = withoutComment(line.text.slice(column)).trimEnd();
    let end = line.start + column + value.length;
    let blanks = 0;
    for (let next = index + 1; next < this.lines.length; next++) {
      const following = this.line(next);
      const content = following.text.trim();
      if (content === "") {
        blanks++;
        continue;
      }
      if (following.indent <= parentIndent || content.startsWith("#")) break;
      if (this.findColon(following.text, following.indent) !== undefined) this.fail(next, "unexpected indentation");
      const piece = withoutComment(following.text.slice(following.indent)).trimEnd();
      value += blanks === 0 ? ` ${piece}` : "\n".repeat(blanks);
      if (blanks > 0) value += piece;
      end = following.start + following.indent + piece.length;
      blanks = 0;
      this.consume(next);
    }
    this.push(path, value, "plain", index, line.start + column, end, parentIndent);
  }

  private quoted(index: number, column: number, parentIndent: number, path: string[]): void {
    const quote = this.line(index).text.charAt(column);
    let value = "";
    let current = index;
    let position = column + 1;
    for (;;) {
      const text = this.line(current).text;
      let piece = "";
      let closed = -1;
      let escapedBreak = false;
      for (let i = position; i < text.length; i++) {
        const char = text.charAt(i);
        if (quote === "'" && char === "'") {
          if (text.charAt(i + 1) === "'") {
            piece += "'";
            i++;
            continue;
          }
          closed = i;
          break;
        }
        if (quote === '"' && char === "\\") {
          if (i + 1 === text.length) {
            escapedBreak = true;
            break;
          }
          const [decoded, length] = this.escape(text, i, current);
          piece += decoded;
          i += length - 1;
          continue;
        }
        if (quote === '"' && char === '"') {
          closed = i;
          break;
        }
        piece += char;
      }
      if (closed !== -1) {
        value += piece;
        const after = text.slice(closed + 1);
        if (!/^\s*(?:#.*)?$/.test(after)) this.fail(current, "unexpected text after the closing quote");
        this.consume(current);
        const start = this.line(index).start + column;
        this.push(
          path,
          value,
          quote === '"' ? "double" : "single",
          index,
          start,
          this.line(current).start + closed + 1,
          parentIndent,
        );
        return;
      }
      // The string goes on: a line break folds into a space, blank lines into line breaks.
      value += escapedBreak ? piece : piece.replace(/[ \t]+$/, "");
      let blanks = 0;
      current++;
      while (current < this.lines.length && this.line(current).text.trim() === "") {
        blanks++;
        current++;
      }
      if (current >= this.lines.length) this.fail(index, "unterminated string");
      if (blanks > 0) value += "\n".repeat(blanks);
      else if (!escapedBreak) value += " ";
      const next = this.line(current).text;
      position = next.length - next.replace(/^[ \t]+/, "").length;
    }
  }

  private blockScalar(index: number, column: number, parentIndent: number, path: string[]): void {
    const line = this.line(index);
    const header = BLOCK_HEADER.exec(line.text.slice(column));
    if (header === null) this.fail(index, "invalid block scalar header");
    const [written = "", kind, chompBefore = "", digit = "", chompAfter = ""] = header;
    if (!/^\s*(?:#.*)?$/.test(line.text.slice(column + written.length))) {
      this.fail(index, "unexpected text after the block scalar header");
    }
    const chomp = chompBefore || chompAfter;
    let contentIndent = digit === "" ? undefined : parentIndent + Number(digit);
    const body: { index: number; text: string }[] = [];
    let trailing = 0;
    for (let next = index + 1; next < this.lines.length; next++) {
      const following = this.line(next);
      if (following.text.trim() === "") {
        trailing++;
        continue;
      }
      contentIndent ??= following.indent;
      if (following.indent < contentIndent || contentIndent <= parentIndent) break;
      for (let blank = trailing; blank > 0; blank--) body.push({ index: next - blank, text: "" });
      body.push({ index: next, text: following.text.slice(contentIndent) });
      trailing = 0;
    }
    const lines = body.map((item) => item.text);
    let value = kind === "|" ? lines.join("\n") : fold(lines);
    if (lines.length === 0) value = "";
    else if (chomp === "") value += "\n";
    else if (chomp === "+") value += "\n".repeat(1 + trailing);
    const last = body.at(-1);
    const end =
      last === undefined
        ? line.start + column + written.length
        : this.line(last.index).start + this.line(last.index).text.length;
    this.consume(last?.index ?? index);
    const start = line.start + column;
    this.push(path, value, kind === "|" ? "literal" : "folded", index, start, end, parentIndent, {
      header: written,
      contentIndent: contentIndent ?? parentIndent + 2,
    });
  }

  private flowSequence(index: number, column: number, parentIndent: number, path: string[]): void {
    const line = this.line(index);
    const text = line.text;
    let position = column + 1;
    let item = 0;
    for (;;) {
      while (text.charAt(position) === " ") position++;
      const char = text.charAt(position);
      if (char === "]") break;
      if (char === "") this.fail(index, "flow sequences must fit on one line");
      if (char === "[" || char === "{") this.fail(index, "nested flow collections are not supported");
      if (char === "&" || char === "*" || char === "!") this.fail(index, "anchors, aliases and tags are not supported");
      let value: string;
      let end: number;
      let style: YamlStyle;
      if (char === '"' || char === "'") {
        const close = closingQuote(text, position);
        if (close === undefined) this.fail(index, "unterminated string");
        const raw = text.slice(position + 1, close);
        value = char === '"' ? this.decodeDouble(raw, index) : raw.replaceAll("''", "'");
        style = char === '"' ? "double" : "single";
        end = close + 1;
      } else {
        const stop = text.slice(position).search(/[,\]]/);
        if (stop === -1) this.fail(index, "flow sequences must fit on one line");
        value = text.slice(position, position + stop).trimEnd();
        style = "plain";
        end = position + value.length;
      }
      if (style !== "plain" || value !== "") {
        this.push([...path, String(item)], value, style, index, line.start + position, line.start + end, parentIndent, {
          inFlow: true,
        });
        item++;
      }
      position = end;
      while (text.charAt(position) === " ") position++;
      if (text.charAt(position) === ",") position++;
      else if (text.charAt(position) !== "]") this.fail(index, 'expected "," or "]" in the flow sequence');
    }
    if (!/^\s*(?:#.*)?$/.test(text.slice(position + 1))) this.fail(index, "unexpected text after the flow sequence");
    this.consume(index);
  }

  private push(
    path: string[],
    value: string,
    style: YamlStyle,
    index: number,
    start: number,
    end: number,
    indent: number,
    extra: { header?: string; contentIndent?: number; inFlow?: boolean } = {},
  ): void {
    const isText = value !== "" && (style !== "plain" || !NOT_TEXT.test(value));
    this.scalars.push({
      path,
      value,
      isText,
      style,
      line: this.line(index).number,
      start,
      end,
      indent,
      ...(extra.header !== undefined ? { header: extra.header } : {}),
      ...(extra.contentIndent !== undefined ? { contentIndent: extra.contentIndent } : {}),
      inFlow: extra.inFlow ?? false,
      entryStart: start,
      entryEnd: end,
      removable: false,
    });
  }

  private decodeDouble(raw: string, index: number): string {
    let value = "";
    for (let i = 0; i < raw.length; i++) {
      if (raw.charAt(i) !== "\\") {
        value += raw.charAt(i);
        continue;
      }
      const [decoded, length] = this.escape(raw, i, index);
      value += decoded;
      i += length - 1;
    }
    return value;
  }

  /** The escape at text[at] ("\n", "é"...): its character and its length. */
  private escape(text: string, at: number, index: number): [string, number] {
    const code = text.charAt(at + 1);
    const simple = ESCAPES[code];
    if (simple !== undefined) return [simple, 2];
    const digits = code === "x" ? 2 : code === "u" ? 4 : code === "U" ? 8 : 0;
    const hex = text.slice(at + 2, at + 2 + digits);
    if (digits === 0 || !new RegExp(`^[0-9a-fA-F]{${digits}}$`).test(hex)) {
      return this.fail(index, `invalid escape \\${code}`);
    }
    return [String.fromCodePoint(Number.parseInt(hex, 16)), 2 + digits];
  }

  private isSequenceItem(position: Position): boolean {
    const text = this.line(position.index).text;
    return (
      text.charAt(position.column) === "-" && /^(?: |$)/.test(text.slice(position.column + 1, position.column + 2))
    );
  }

  private line(index: number): Line {
    const line = this.lines[index];
    if (line === undefined) throw new Error(`no line ${index}`);
    return line;
  }

  private fail(index: number, reason: string): never {
    throw new ReadError(this.file, `line ${this.lines[index]?.number ?? index + 1}: ${reason}`);
  }
}

/** The offset of the quote that closes the string opened at text[open], on the same line. */
function closingQuote(text: string, open: number): number | undefined {
  const quote = text.charAt(open);
  for (let i = open + 1; i < text.length; i++) {
    const char = text.charAt(i);
    if (quote === '"' && char === "\\") i++;
    else if (quote === "'" && char === "'" && text.charAt(i + 1) === "'") i++;
    else if (char === quote) return i;
  }
  return undefined;
}

/** A plain value without its comment: "#" after a space starts one. */
function withoutComment(text: string): string {
  const comment = text.search(/[ \t]#/);
  return comment === -1 ? text : text.slice(0, comment);
}

/** Folded lines: joined by spaces, a blank line as a line break, more indented lines kept as they are. */
function fold(lines: readonly string[]): string {
  let value = "";
  let previous: "none" | "text" | "more" = "none";
  let blanks = 0;
  for (const line of lines) {
    if (line === "") {
      blanks++;
      continue;
    }
    const more = /^[ \t]/.test(line);
    if (previous === "none") value += "\n".repeat(blanks);
    else if (previous === "text" && !more) value += blanks === 0 ? " " : "\n".repeat(blanks);
    else value += "\n".repeat(blanks + 1);
    value += line;
    previous = more ? "more" : "text";
    blanks = 0;
  }
  return value;
}
