/** A string literal of a Ren'Py script, as written. */
export interface Literal {
  /** Offset of the literal, prefix included: source.slice(start, end) is the literal. */
  readonly start: number;
  /** Offset just after the closing quote(s). */
  readonly end: number;
  /** 1-based line where the literal starts. */
  readonly line: number;
  /** Letters written just before the quote ("r", "u", "f", "rb"...), as written. */
  readonly prefix: string;
  readonly quote: string;
  readonly triple: boolean;
  /** The text between the quotes, not decoded. */
  readonly body: string;
}

export type Token =
  | { readonly kind: "string"; readonly literal: Literal }
  | { readonly kind: "word"; readonly text: string; readonly start: number }
  | { readonly kind: "punct"; readonly text: string; readonly start: number };

/**
 * A logical line: Ren'Py joins the physical lines of open parentheses, open strings and backslash continuations,
 * like Python. Comments are left out.
 */
export interface LogicalLine {
  /** 1-based line where the logical line starts. */
  readonly line: number;
  /** Number of spaces before the first token. */
  readonly indent: number;
  readonly tokens: readonly Token[];
}

/** The script cannot be split into lines (a string or a parenthesis is never closed). */
export class RenpySyntaxError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`line ${line}: ${message}`);
    this.name = "RenpySyntaxError";
    this.line = line;
  }
}

// Sticky (y) patterns only match at lastIndex. Words include dotted names and numbers: "renpy.pause", "1.0".
const WORD = /[\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*/uy;
const STRING_PREFIX = /^(?:[rRuUfFbB]|[rR][bBfF]|[bBfF][rR])$/;
const QUOTES = new Set(['"', "'", "`"]);
const OPENING = new Set(["(", "[", "{"]);
const CLOSING = new Set([")", "]", "}"]);

/** Splits a Ren'Py script (or the Python of its python blocks) into logical lines of tokens. */
export function logicalLines(source: string): LogicalLine[] {
  return new Lexer(source).run();
}

class Lexer {
  private readonly src: string;
  private pos: number;
  private line = 1;
  private readonly lines: LogicalLine[] = [];

  constructor(src: string) {
    this.src = src;
    this.pos = src.startsWith("\u{feff}") ? 1 : 0;
  }

  run(): LogicalLine[] {
    while (this.pos < this.src.length) this.readLine();
    return this.lines;
  }

  /** Reads one logical line, or skips a blank or comment-only line. */
  private readLine(): void {
    const lineStart = this.pos;
    while (this.src.charAt(this.pos) === " " || this.src.charAt(this.pos) === "\t") this.pos++;
    const indent = this.pos - lineStart;
    const line = this.line;
    const tokens: Token[] = [];
    let depth = 0;

    while (this.pos < this.src.length) {
      const char = this.src.charAt(this.pos);
      if (this.atNewline()) {
        this.newline();
        if (depth === 0) break;
        continue;
      }
      if (char === " " || char === "\t") {
        this.pos++;
        continue;
      }
      if (char === "#") {
        while (this.pos < this.src.length && !this.atNewline()) this.pos++;
        continue;
      }
      if (char === "\\" && this.isNewline(this.pos + 1)) {
        this.pos++;
        this.newline();
        continue;
      }
      if (QUOTES.has(char)) {
        tokens.push({ kind: "string", literal: this.readString("", this.pos) });
        continue;
      }
      WORD.lastIndex = this.pos;
      const word = WORD.exec(this.src)?.[0];
      if (word !== undefined) {
        const start = this.pos;
        this.pos += word.length;
        if (STRING_PREFIX.test(word) && QUOTES.has(this.src.charAt(this.pos))) {
          tokens.push({ kind: "string", literal: this.readString(word, start) });
        } else {
          tokens.push({ kind: "word", text: word, start });
        }
        continue;
      }
      if (OPENING.has(char)) depth++;
      if (CLOSING.has(char) && depth > 0) depth--;
      tokens.push({ kind: "punct", text: char, start: this.pos });
      this.pos++;
    }

    if (depth > 0) throw new RenpySyntaxError("parenthesis never closed", line);
    if (tokens.length > 0) this.lines.push({ line, indent, tokens });
  }

  /** Reads a string literal whose quote is at the current position; the prefix (if any) starts at `start`. */
  private readString(prefix: string, start: number): Literal {
    const line = this.line;
    const quote = this.src.charAt(this.pos);
    const triple = this.src.startsWith(quote.repeat(3), this.pos);
    const delimiter = triple ? quote.repeat(3) : quote;
    this.pos += delimiter.length;
    const bodyStart = this.pos;
    for (;;) {
      if (this.pos >= this.src.length) throw new RenpySyntaxError("unfinished string", line);
      if (this.src.startsWith(delimiter, this.pos)) break;
      const char = this.src.charAt(this.pos);
      if (char === "\\") {
        this.pos++;
        if (this.atNewline()) this.newline();
        else this.pos++;
      } else if (this.atNewline()) {
        this.newline(); // Ren'Py strings may span lines, even with single quotes
      } else {
        this.pos++;
      }
    }
    const body = this.src.slice(bodyStart, this.pos);
    this.pos += delimiter.length;
    return { start, end: this.pos, line, prefix, quote, triple, body };
  }

  private isNewline(pos: number): boolean {
    const char = this.src.charAt(pos);
    return char === "\n" || char === "\r";
  }

  private atNewline(): boolean {
    return this.isNewline(this.pos);
  }

  /** Consumes \n, \r or \r\n as a single line break. */
  private newline(): void {
    if (this.src.charAt(this.pos) === "\r" && this.src.charAt(this.pos + 1) === "\n") this.pos++;
    this.pos++;
    this.line++;
  }
}
