/**
 * A minimal XML parser for the language files of RimWorld: elements, attributes, text, CDATA, comments, the five
 * predefined entities and numeric character references. No namespaces, no DTD (a doctype without internal subset is
 * skipped), no external entities: what a translation file needs, and nothing that could read other files.
 * Every node keeps its offsets in the source, so that a writer can replace a text in place.
 */

export interface XmlAttribute {
  readonly name: string;
  /** Decoded value. */
  readonly value: string;
}

export interface XmlText {
  readonly kind: "text";
  /** Decoded value: entities and character references replaced. */
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface XmlCData {
  readonly kind: "cdata";
  /** Content of the section, verbatim. */
  readonly value: string;
  /** Offset of "<![CDATA[". */
  readonly start: number;
  /** Offset just after "]]>". */
  readonly end: number;
}

export interface XmlComment {
  readonly kind: "comment";
  /** Content between "<!--" and "-->", verbatim. */
  readonly value: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

export interface XmlElement {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: readonly XmlAttribute[];
  /** 1-based line of the start tag. */
  readonly line: number;
  /** Offset of "<" of the start tag. */
  readonly start: number;
  /** Offset just after the end tag (or "/>"). */
  readonly end: number;
  /** source.slice(contentStart, contentEnd) is everything between the start and end tags. Empty when self-closing. */
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly selfClosing: boolean;
  readonly children: readonly XmlNode[];
}

export type XmlNode = XmlElement | XmlText | XmlCData | XmlComment;

/** The XML cannot be parsed. */
export class XmlSyntaxError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`line ${line}: ${message}`);
    this.name = "XmlSyntaxError";
    this.line = line;
  }
}

/** Parses an XML document (without byte order mark) and returns its root element. */
export function parseXml(source: string): XmlElement {
  return new Parser(source).document();
}

const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

// Sticky (y) patterns only match at lastIndex.
const NAME = /[\p{L}_:][\p{L}\p{N}_.:-]*/uy;
const REFERENCE = /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([\p{L}_][\p{L}\p{N}_.-]*));/uy;
const SPACES = /[ \t\r\n]*/y;

class Parser {
  private readonly src: string;
  private pos = 0;
  /** Offset where each line starts: the line of an offset is found by binary search. */
  private readonly lineStarts: number[] = [0];

  constructor(src: string) {
    this.src = src;
    for (let i = 0; i < src.length; i++) {
      const char = src.charAt(i);
      if (char === "\r" && src.charAt(i + 1) === "\n") i++;
      if (char === "\r" || char === "\n") this.lineStarts.push(i + 1);
    }
  }

  document(): XmlElement {
    let root: XmlElement | undefined;
    for (;;) {
      this.skipSpaces();
      if (this.pos >= this.src.length) break;
      if (this.at("<?")) this.skipProcessingInstruction();
      else if (this.at("<!--")) this.comment();
      else if (this.at("<!DOCTYPE")) this.skipDoctype();
      else if (this.at("</")) throw this.error(`unexpected </${this.nameAt(this.pos + 2) ?? ""}>`);
      else if (this.at("<")) {
        if (root !== undefined) throw this.error("more than one root element");
        root = this.element();
      } else throw this.error("text outside the root element");
    }
    if (root === undefined) throw this.error("no root element");
    return root;
  }

  private element(): XmlElement {
    const start = this.pos;
    const line = this.lineAt(start);
    const name = this.nameAt(start + 1);
    if (name === undefined) throw this.error("invalid tag (a name must follow <)");
    this.pos = start + 1 + name.length;
    const attributes = this.attributes();

    if (this.at("/>")) {
      this.pos += 2;
      const end = this.pos;
      return {
        kind: "element",
        name,
        attributes,
        line,
        start,
        end,
        contentStart: end,
        contentEnd: end,
        selfClosing: true,
        children: [],
      };
    }
    this.pos++; // ">"
    const contentStart = this.pos;
    const children: XmlNode[] = [];
    for (;;) {
      if (this.pos >= this.src.length) throw new XmlSyntaxError(`unclosed element <${name}>`, line);
      if (this.at("</")) {
        const contentEnd = this.pos;
        const closing = this.nameAt(this.pos + 2);
        if (closing !== name) throw this.error(`expected </${name}>, found </${closing ?? ""}...`);
        this.pos += 2 + closing.length;
        this.skipSpaces();
        if (!this.at(">")) throw this.error(`expected > to end </${name}`);
        this.pos++;
        return {
          kind: "element",
          name,
          attributes,
          line,
          start,
          end: this.pos,
          contentStart,
          contentEnd,
          selfClosing: false,
          children,
        };
      }
      if (this.at("<!--")) children.push(this.comment());
      else if (this.at("<![CDATA[")) children.push(this.cdata());
      else if (this.at("<?")) this.skipProcessingInstruction();
      else if (this.at("<")) children.push(this.element());
      else children.push(this.text());
    }
  }

  /** Reads the attributes of a start tag, up to (not including) ">" or "/>". */
  private attributes(): XmlAttribute[] {
    const attributes: XmlAttribute[] = [];
    for (;;) {
      this.skipSpaces();
      if (this.at(">") || this.at("/>")) return attributes;
      const name = this.nameAt(this.pos);
      if (name === undefined) throw this.error("invalid tag (attribute name expected)");
      if (attributes.some((attribute) => attribute.name === name)) throw this.error(`duplicate attribute ${name}`);
      this.pos += name.length;
      this.skipSpaces();
      if (!this.at("=")) throw this.error(`expected = after attribute ${name}`);
      this.pos++;
      this.skipSpaces();
      const quote = this.src.charAt(this.pos);
      if (quote !== '"' && quote !== "'") throw this.error(`expected a quote after ${name}=`);
      const close = this.src.indexOf(quote, this.pos + 1);
      if (close === -1) throw this.error(`unclosed attribute ${name}`);
      const raw = this.src.slice(this.pos + 1, close);
      if (raw.includes("<")) throw this.error(`"<" in attribute ${name} (write &lt;)`);
      attributes.push({ name, value: this.decode(raw, this.pos + 1) });
      this.pos = close + 1;
    }
  }

  private text(): XmlText {
    const start = this.pos;
    const next = this.src.indexOf("<", start);
    const end = next === -1 ? this.src.length : next;
    this.pos = end;
    return { kind: "text", value: this.decode(this.src.slice(start, end), start), start, end };
  }

  private cdata(): XmlCData {
    const start = this.pos;
    const close = this.src.indexOf("]]>", start + 9);
    if (close === -1) throw this.error("unclosed CDATA section");
    this.pos = close + 3;
    return { kind: "cdata", value: this.src.slice(start + 9, close), start, end: this.pos };
  }

  private comment(): XmlComment {
    const start = this.pos;
    const close = this.src.indexOf("-->", start + 4);
    if (close === -1) throw this.error("unclosed comment");
    this.pos = close + 3;
    return { kind: "comment", value: this.src.slice(start + 4, close), line: this.lineAt(start), start, end: this.pos };
  }

  private skipProcessingInstruction(): void {
    const close = this.src.indexOf("?>", this.pos + 2);
    if (close === -1) throw this.error("unclosed processing instruction");
    this.pos = close + 2;
  }

  private skipDoctype(): void {
    const close = this.src.indexOf(">", this.pos);
    const bracket = this.src.indexOf("[", this.pos);
    if (bracket !== -1 && (close === -1 || bracket < close)) {
      throw this.error("a doctype with an internal subset is not supported");
    }
    if (close === -1) throw this.error("unclosed doctype");
    this.pos = close + 1;
  }

  /** Replaces entities and character references; offset is where raw starts in the source, for error lines. */
  private decode(raw: string, offset: number): string {
    if (!raw.includes("&")) return raw;
    let value = "";
    let copied = 0;
    for (let amp = raw.indexOf("&"); amp !== -1; amp = raw.indexOf("&", copied)) {
      value += raw.slice(copied, amp);
      REFERENCE.lastIndex = amp;
      const match = REFERENCE.exec(raw);
      const line = this.lineAt(offset + amp);
      if (match === null) {
        if (raw.startsWith("&#", amp)) throw new XmlSyntaxError("invalid character reference", line);
        throw new XmlSyntaxError('unknown entity (a bare "&" must be written &amp;)', line);
      }
      const [reference, hex, decimal, name] = match;
      if (name !== undefined) {
        const entity = ENTITIES.get(name);
        if (entity === undefined) throw new XmlSyntaxError(`unknown entity &${name};`, line);
        value += entity;
      } else {
        const code = hex !== undefined ? Number.parseInt(hex, 16) : Number(decimal);
        if (!isXmlCharacter(code)) throw new XmlSyntaxError(`invalid character reference ${reference}`, line);
        value += String.fromCodePoint(code);
      }
      copied = amp + reference.length;
    }
    return value + raw.slice(copied);
  }

  private nameAt(pos: number): string | undefined {
    NAME.lastIndex = pos;
    return NAME.exec(this.src)?.[0];
  }

  private at(text: string): boolean {
    return this.src.startsWith(text, this.pos);
  }

  private skipSpaces(): void {
    SPACES.lastIndex = this.pos;
    SPACES.exec(this.src);
    this.pos = SPACES.lastIndex;
  }

  private lineAt(offset: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  }

  private error(message: string): XmlSyntaxError {
    return new XmlSyntaxError(message, this.lineAt(this.pos));
  }
}

/** Code points a character reference may produce (XML 1.0: no NUL, no lone surrogate, nothing above U+10FFFF). */
function isXmlCharacter(code: number): boolean {
  if (code === 0x9 || code === 0xa || code === 0xd) return true;
  if (code < 0x20) return false;
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return code <= 0x10ffff && code !== 0xfffe && code !== 0xffff;
}
