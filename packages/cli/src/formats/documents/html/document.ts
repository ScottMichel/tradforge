import { stripBom } from "../../../core/reader.js";

/**
 * The texts of an HTML page, read the forgiving way browsers read it: unclosed <p> and <li>, void elements (<br>,
 * <img>), unquoted attributes, named character references. No tree is built: a text is the run of text and inline
 * elements (<a>, <strong>, <br>...) between two block tags (<p>, <li>, <h1>...), with its inline tags as they are
 * written. <script>, <style>, <pre>, comments and the doctype are not texts.
 *
 * Some attributes are texts too: alt, title, placeholder and aria-label, and the content of description meta tags.
 * Inside a text, an inline element keeps its attributes as they are: the text and the attribute would overlap.
 */

export interface HtmlText {
  readonly kind: "element" | "attribute";
  /** Text decoded and spaces collapsed; inline tags as they are written. */
  readonly value: string;
  /** The inline tags of the source, copied as they are into the translation. */
  readonly tags: readonly string[];
  /** Offsets of what the translation replaces: the trimmed run, or the attribute value (quotes included). */
  readonly start: number;
  readonly end: number;
  readonly line: number;
  /** An attribute value written without quotes: the translation gets some. */
  readonly unquoted?: boolean;
}

export interface HtmlDocument {
  readonly texts: readonly HtmlText[];
  /** The value of <html lang="...">, quotes included: the writer names the target language there. */
  readonly lang?: { readonly start: number; readonly end: number; readonly quoted: boolean };
}

interface Attribute {
  readonly name: string;
  readonly value: string;
  /** Offsets of the value as written, quotes included; undefined for an attribute without value. */
  readonly start?: number;
  readonly end?: number;
  readonly quoted: boolean;
}

type Token =
  | { readonly kind: "text"; readonly raw: string; readonly start: number; readonly end: number }
  | {
      readonly kind: "start";
      readonly name: string;
      readonly attributes: readonly Attribute[];
      readonly start: number;
      readonly end: number;
    }
  | { readonly kind: "end"; readonly name: string; readonly start: number; readonly end: number }
  | { readonly kind: "other"; readonly start: number; readonly end: number };

/** Elements that flow inside a text. Any other element starts or ends a block. */
const INLINE = new Set(
  "a abbr b bdi bdo br cite code data del dfn em i img input ins kbd label mark q s samp small span strong sub sup time u var wbr".split(
    " ",
  ),
);
/** Elements whose content is never a text, skipped up to their end tag. */
const SKIPPED = new Set(["script", "style", "pre", "textarea", "template", "svg", "math", "noscript"]);
const TEXT_ATTRIBUTES = new Set(["alt", "title", "placeholder", "aria-label"]);
const DESCRIPTION_META = /^(?:description|og:title|og:description|twitter:title|twitter:description)$/i;

export function parseHtml(content: string): HtmlDocument {
  const text = stripBom(content);
  const tokens = tokenize(text);
  const lineAt = lineFinder(text);
  const texts: HtmlText[] = [];
  let lang: HtmlDocument["lang"];

  const attributeTexts = (token: Extract<Token, { kind: "start" }>) => {
    const isMeta = token.name === "meta";
    const metaName = token.attributes.find((attr) => attr.name === "name" || attr.name === "property")?.value ?? "";
    for (const attr of token.attributes) {
      const wanted =
        TEXT_ATTRIBUTES.has(attr.name) || (isMeta && attr.name === "content" && DESCRIPTION_META.test(metaName));
      if (!wanted || attr.start === undefined || attr.end === undefined) continue;
      const value = collapse(decodeEntities(attr.value)).trim();
      if (!/\p{L}/u.test(value)) continue;
      texts.push({
        kind: "attribute",
        value,
        tags: [],
        start: attr.start,
        end: attr.end,
        line: lineAt(attr.start),
        ...(attr.quoted ? {} : { unquoted: true }),
      });
    }
  };

  let run: Token[] = [];
  const flush = () => {
    const parts = run;
    run = [];
    const textual = parts.filter((token) => token.kind === "text" && /\p{L}/u.test(decodeEntities(token.raw)));
    if (textual.length === 0) {
      for (const token of parts) if (token.kind === "start") attributeTexts(token);
      return;
    }
    // Trim the run: from its first non-blank token to its last one.
    let first = 0;
    let last = parts.length - 1;
    const blank = (token: Token) => token.kind === "text" && token.raw.trim() === "";
    while (first < last && blank(parts[first] as Token)) first++;
    while (last > first && blank(parts[last] as Token)) last--;
    const kept = parts.slice(first, last + 1);
    const tags: string[] = [];
    let value = "";
    for (const token of kept) {
      if (token.kind === "text") value += collapse(decodeEntities(token.raw));
      else {
        const raw = text.slice(token.start, token.end);
        tags.push(raw);
        value += raw;
      }
    }
    const head = kept[0] as Token;
    const tail = kept.at(-1) as Token;
    const leading = head.kind === "text" ? head.raw.length - head.raw.trimStart().length : 0;
    const trailing = tail.kind === "text" ? tail.raw.length - tail.raw.trimEnd().length : 0;
    const start = head.start + leading;
    texts.push({ kind: "element", value: value.trim(), tags, start, end: tail.end - trailing, line: lineAt(start) });
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    if (token.kind === "text") {
      run.push(token);
      continue;
    }
    if ((token.kind === "start" || token.kind === "end") && INLINE.has(token.name)) {
      run.push(token);
      continue;
    }
    flush();
    if (token.kind !== "start") continue;
    if (token.name === "html") {
      const attr = token.attributes.find((item) => item.name === "lang");
      if (attr?.start !== undefined && attr.end !== undefined)
        lang = { start: attr.start, end: attr.end, quoted: attr.quoted };
    }
    attributeTexts(token);
    if (token.name === "title") {
      // Raw text up to </title>: references decoded, no tags.
      const close = tokens.findIndex((item, j) => j > i && item.kind === "end" && item.name === "title");
      if (close !== -1) {
        run = tokens.slice(i + 1, close).filter((item) => item.kind === "text");
        flush();
        i = close;
      }
    } else if (SKIPPED.has(token.name)) {
      const close = tokens.findIndex((item, j) => j > i && item.kind === "end" && item.name === token.name);
      i = close === -1 ? tokens.length : close;
    }
  }
  flush();
  return { texts, ...(lang !== undefined ? { lang } : {}) };
}

export function htmlTexts(_file: string, content: string): HtmlText[] {
  return [...parseHtml(content).texts];
}

/** Text, tags, comments and declarations, with their offsets. Raw text elements (<script>, <style>) hold one text. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  /** Where the pending text starts, and where to look for the next "<". */
  let textStart = 0;
  let search = 0;
  const pushText = (end: number) => {
    if (end > textStart) tokens.push({ kind: "text", raw: text.slice(textStart, end), start: textStart, end });
  };
  const resume = (end: number) => {
    textStart = end;
    search = end;
  };
  while (search < text.length) {
    const open = text.indexOf("<", search);
    if (open === -1) break;
    const next = text.charAt(open + 1);
    if (!/[A-Za-z/!?]/.test(next)) {
      search = open + 1; // a "<" that starts no tag is text: "a < b" stays one text
      continue;
    }
    pushText(open);
    if (text.startsWith("<!--", open)) {
      const close = text.indexOf("-->", open + 4);
      const end = close === -1 ? text.length : close + 3;
      tokens.push({ kind: "other", start: open, end });
      resume(end);
      continue;
    }
    if (next === "!" || next === "?") {
      const close = text.indexOf(">", open);
      const end = close === -1 ? text.length : close + 1;
      tokens.push({ kind: "other", start: open, end });
      resume(end);
      continue;
    }
    const tag = readTag(text, open);
    tokens.push(tag);
    resume(tag.end);
    if (tag.kind === "start" && (tag.name === "script" || tag.name === "style")) {
      // Raw text: a "<" inside a script starts no tag. It is skipped with its element.
      const close = text.toLowerCase().indexOf(`</${tag.name}`, tag.end);
      const end = close === -1 ? text.length : close;
      pushText(end);
      resume(end);
    }
  }
  pushText(text.length);
  return tokens;
}

function readTag(text: string, open: number): Token {
  const closing = text.charAt(open + 1) === "/";
  let i = open + (closing ? 2 : 1);
  const nameStart = i;
  while (i < text.length && /[^\s/>]/.test(text.charAt(i))) i++;
  const name = text.slice(nameStart, i).toLowerCase();
  const attributes: Attribute[] = [];
  for (;;) {
    while (i < text.length && /[\s/]/.test(text.charAt(i))) i++;
    if (i >= text.length || text.charAt(i) === ">") break;
    const attrStart = i;
    while (i < text.length && /[^\s/>=]/.test(text.charAt(i))) i++;
    const attrName = text.slice(attrStart, i).toLowerCase();
    while (i < text.length && /\s/.test(text.charAt(i))) i++;
    if (text.charAt(i) !== "=") {
      attributes.push({ name: attrName, value: "", quoted: false });
      continue;
    }
    i++;
    while (i < text.length && /\s/.test(text.charAt(i))) i++;
    const quote = text.charAt(i);
    if (quote === '"' || quote === "'") {
      const close = text.indexOf(quote, i + 1);
      const end = close === -1 ? text.length : close + 1;
      attributes.push({ name: attrName, value: text.slice(i + 1, end - 1), start: i, end, quoted: true });
      i = end;
    } else {
      const valueStart = i;
      while (i < text.length && /[^\s>]/.test(text.charAt(i))) i++;
      attributes.push({ name: attrName, value: text.slice(valueStart, i), start: valueStart, end: i, quoted: false });
    }
  }
  const end = Math.min(text.length, i + 1);
  return closing ? { kind: "end", name, start: open, end } : { kind: "start", name, attributes, start: open, end };
}

/** Runs of spaces read as one, as browsers show them outside <pre>. */
function collapse(text: string): string {
  return text.replace(/[ \t\n\r\f]+/g, " ");
}

const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u{a0}",
  copy: "\u{a9}",
  reg: "\u{ae}",
  trade: "\u{2122}",
  hellip: "\u{2026}",
  mdash: "\u{2014}",
  ndash: "\u{2013}",
  lsquo: "\u{2018}",
  rsquo: "\u{2019}",
  ldquo: "\u{201c}",
  rdquo: "\u{201d}",
  laquo: "\u{ab}",
  raquo: "\u{bb}",
  middot: "\u{b7}",
  bull: "\u{2022}",
  euro: "\u{20ac}",
  eacute: "\u{e9}",
  egrave: "\u{e8}",
  ecirc: "\u{ea}",
  agrave: "\u{e0}",
  acirc: "\u{e2}",
  ccedil: "\u{e7}",
  ocirc: "\u{f4}",
  ucirc: "\u{fb}",
  ugrave: "\u{f9}",
  icirc: "\u{ee}",
  iuml: "\u{ef}",
  euml: "\u{eb}",
  ouml: "\u{f6}",
  uuml: "\u{fc}",
  auml: "\u{e4}",
  szlig: "\u{df}",
  ntilde: "\u{f1}",
  Eacute: "\u{c9}",
};

/** Character references decoded: the common named ones and every numeric one; an unknown name stays as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g, (match, decimal, hex, name) => {
    if (decimal !== undefined) return String.fromCodePoint(Number(decimal));
    if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
    return NAMED[name] ?? match;
  });
}

function lineFinder(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charAt(i) === "\n") starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((starts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}
