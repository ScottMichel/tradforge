/** A string literal found in Lua source code. */
export interface LuaString {
  /** Decoded value, as Lua sees it at runtime. */
  readonly value: string;
  /** 1-based line where the literal starts. */
  readonly line: number;
  /** Offset of the literal in the source, opening quote or bracket included. */
  readonly start: number;
  /** Offset just after the closing quote or bracket: source.slice(start, end) is the literal. */
  readonly end: number;
}

/** The Lua source cannot be tokenized (e.g. a string is never closed). */
export class LuaSyntaxError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`line ${line}: ${message}`);
    this.name = "LuaSyntaxError";
    this.line = line;
  }
}

/** Finds every string literal of a Lua source, skipping comments. */
export function extractLuaStrings(source: string): LuaString[] {
  return new Lexer(source).run();
}

const SIMPLE_ESCAPES = new Map([
  ["a", "\x07"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\v"],
  ["\\", "\\"],
  ['"', '"'],
  ["'", "'"],
]);

// Sticky (y) patterns only match at lastIndex: no slicing needed.
const LONG_BRACKET_OPEN = /\[(=*)\[/y;
const HEX_BYTE = /[0-9a-fA-F]{2}/y;
const UNICODE_ESCAPE = /\{([0-9a-fA-F]{1,8})\}/y;
const DECIMAL_BYTE = /[0-9]{1,3}/y;
const SPACE = /\s/;

const encoder = new TextEncoder();
const decoder = new TextDecoder(); // UTF-8; invalid bytes become U+FFFD

/** Lua strings are bytes: "\195\169" is the UTF-8 encoding of "é". */
class ByteBuffer {
  private readonly bytes: number[] = [];
  private pending = "";

  text(text: string): void {
    this.pending += text;
  }

  byte(value: number): void {
    this.flush();
    this.bytes.push(value);
  }

  decode(): string {
    if (this.bytes.length === 0) return this.pending;
    this.flush();
    return decoder.decode(new Uint8Array(this.bytes));
  }

  private flush(): void {
    for (const byte of encoder.encode(this.pending)) this.bytes.push(byte);
    this.pending = "";
  }
}

class Lexer {
  private readonly src: string;
  private pos = 0;
  private line = 1;
  private readonly strings: LuaString[] = [];

  constructor(src: string) {
    this.src = src;
  }

  run(): LuaString[] {
    while (this.pos < this.src.length) {
      const char = this.src.charAt(this.pos);
      if (char === '"' || char === "'") {
        this.readShortString(char);
        continue;
      }
      if (char === "-" && this.src.charAt(this.pos + 1) === "-") {
        this.skipComment();
        continue;
      }
      const level = char === "[" ? this.longBracketLevel() : undefined;
      if (level !== undefined) {
        const line = this.line;
        const start = this.pos;
        const value = this.readLongBracket(level, "string");
        this.strings.push({ value, line, start, end: this.pos });
        continue;
      }
      this.advance();
    }
    return this.strings;
  }

  private readShortString(quote: string): void {
    const line = this.line;
    const start = this.pos;
    const buffer = new ByteBuffer();
    this.pos++;
    for (;;) {
      const char = this.src.charAt(this.pos);
      if (char === "" || char === "\n" || char === "\r") throw new LuaSyntaxError("unfinished string", line);
      if (char === quote) break;
      if (char === "\\") {
        this.readEscape(buffer);
      } else {
        buffer.text(char);
        this.pos++;
      }
    }
    this.pos++;
    this.strings.push({ value: buffer.decode(), line, start, end: this.pos });
  }

  private readEscape(buffer: ByteBuffer): void {
    const char = this.src.charAt(this.pos + 1);
    const simple = SIMPLE_ESCAPES.get(char);
    if (simple !== undefined) {
      buffer.text(simple);
      this.pos += 2;
      return;
    }
    if (char === "\n" || char === "\r") {
      this.pos++;
      this.newline();
      buffer.text("\n");
      return;
    }
    if (char === "z") {
      this.pos += 2;
      while (SPACE.test(this.src.charAt(this.pos))) this.advance();
      return;
    }
    if (char === "x") {
      const hex = this.matchAt(HEX_BYTE, this.pos + 2)?.[0];
      if (hex === undefined) throw new LuaSyntaxError("hexadecimal digits expected after \\x", this.line);
      buffer.byte(Number.parseInt(hex, 16));
      this.pos += 2 + hex.length;
      return;
    }
    if (char === "u") {
      const match = this.matchAt(UNICODE_ESCAPE, this.pos + 2);
      const codePoint = Number.parseInt(match?.[1] ?? "", 16);
      if (match === null || !(codePoint <= 0x10ffff)) throw new LuaSyntaxError("invalid \\u{...} escape", this.line);
      buffer.text(String.fromCodePoint(codePoint));
      this.pos += 2 + match[0].length;
      return;
    }
    const digits = this.matchAt(DECIMAL_BYTE, this.pos + 1)?.[0];
    if (digits !== undefined) {
      const value = Number(digits);
      if (value > 255) throw new LuaSyntaxError(`decimal escape too large: \\${digits}`, this.line);
      buffer.byte(value);
      this.pos += 1 + digits.length;
      return;
    }
    throw new LuaSyntaxError(`invalid escape sequence \\${char}`, this.line);
  }

  private skipComment(): void {
    this.pos += 2;
    const level = this.longBracketLevel();
    if (level !== undefined) {
      this.readLongBracket(level, "comment");
      return;
    }
    while (this.pos < this.src.length && !this.atNewline()) this.pos++;
  }

  /** Level of a long bracket opening at the current position ([[ is 0, [==[ is 2), if any. */
  private longBracketLevel(): number | undefined {
    return this.matchAt(LONG_BRACKET_OPEN, this.pos)?.[1]?.length;
  }

  /** Reads [==[ ... ]==] verbatim: no escapes, line breaks normalized to \n. */
  private readLongBracket(level: number, what: "string" | "comment"): string {
    const line = this.line;
    const close = `]${"=".repeat(level)}]`;
    this.pos += level + 2;
    if (this.atNewline()) this.newline(); // Lua skips a line break right after the opening bracket
    let value = "";
    while (this.pos < this.src.length) {
      if (this.src.startsWith(close, this.pos)) {
        this.pos += close.length;
        return value;
      }
      if (this.atNewline()) {
        this.newline();
        value += "\n";
      } else {
        value += this.src.charAt(this.pos);
        this.pos++;
      }
    }
    throw new LuaSyntaxError(`unfinished long ${what}`, line);
  }

  private matchAt(pattern: RegExp, pos: number): RegExpExecArray | null {
    pattern.lastIndex = pos;
    return pattern.exec(this.src);
  }

  private atNewline(): boolean {
    const char = this.src.charAt(this.pos);
    return char === "\n" || char === "\r";
  }

  /** Consumes \n, \r, \r\n or \n\r as a single line break. */
  private newline(): void {
    const first = this.src.charAt(this.pos);
    this.pos++;
    const next = this.src.charAt(this.pos);
    if ((next === "\n" || next === "\r") && next !== first) this.pos++;
    this.line++;
  }

  private advance(): void {
    if (this.atNewline()) this.newline();
    else this.pos++;
  }
}
