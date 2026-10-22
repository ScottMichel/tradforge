import { ReadError, stripBom } from "../../../core/reader.js";
import { escapeXmlText, flattenInline, type InlinePart, splitByTags } from "../../shared/xml/inline.js";
import { parseXml, type XmlElement, XmlSyntaxError } from "../../shared/xml/parser.js";

/**
 * Android string resources (res/values/strings.xml):
 *
 *   <resources>
 *     <string name="welcome">Welcome, <xliff:g id="name">%1$s</xliff:g>! It\'s cold.</string>
 *     <string-array name="days"><item>Monday</item></string-array>
 *     <plurals name="bars"><item quantity="one">%d bar</item><item quantity="other">%d bars</item></plurals>
 *   </resources>
 *
 * Android reads the text of a resource in its own way: backslash escapes (\' \" \n \@...), double quotes that keep
 * spaces, and runs of spaces outside quotes read as one space.
 */

/** One text of a resource: a string, an item of a string array, or one quantity of a plural. */
export interface AndroidText {
  /** Decoded as Android reads it; inline tags (<b>, <xliff:g>) as they are written. */
  readonly value: string;
  readonly tags: readonly string[];
  readonly key: string;
  readonly line: number;
  /** The element whose content holds the text. */
  readonly element: XmlElement;
}

export interface AndroidResource {
  readonly kind: "string" | "string-array" | "plurals";
  readonly name: string;
  readonly element: XmlElement;
  readonly translatable: boolean;
  readonly texts: readonly AndroidText[];
  /** For plurals: the quantity of each text, in the order of the texts. */
  readonly quantities: readonly string[];
}

export function parseAndroid(file: string, content: string): AndroidResource[] {
  const text = stripBom(content);
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (error) {
    if (error instanceof XmlSyntaxError) throw new ReadError(file, error.message, { cause: error });
    throw error;
  }
  if (root.name !== "resources") throw new ReadError(file, `not an Android resource file (its root is <${root.name}>)`);

  const resources: AndroidResource[] = [];
  for (const element of children(root)) {
    const kind = element.name;
    if (kind !== "string" && kind !== "string-array" && kind !== "plurals") continue;
    const name = attribute(element, "name") ?? String(element.line);
    const translatable = attribute(element, "translatable") !== "false";
    const texts: AndroidText[] = [];
    const quantities: string[] = [];
    const add = (holder: XmlElement, key: string) => {
      const { text: raw, tags } = flattenInline(text, holder);
      const value = decodeAndroid(splitByTags(raw, tags));
      if (value.trim() !== "") texts.push({ value, tags, key, line: holder.line, element: holder });
      return value.trim() !== "";
    };
    if (kind === "string") add(element, name);
    else {
      const items = children(element).filter((item) => item.name === "item");
      items.forEach((item, index) => {
        const quantity = attribute(item, "quantity") ?? "other";
        const kept = add(item, kind === "plurals" ? `${name}.${quantity}` : `${name}.${index}`);
        if (kept && kind === "plurals") quantities.push(quantity);
      });
    }
    resources.push({ kind, name, element, translatable, texts, quantities });
  }
  return resources;
}

const ESCAPES: Readonly<Record<string, string>> = { n: "\n", t: "\t" };

/**
 * The text Android reads from the content of a resource. Inline tags are kept as they are; quotes and spaces run
 * across them, as they do in the resource.
 */
export function decodeAndroid(parts: readonly InlinePart[]): string {
  let value = "";
  let quoted = false;
  /** Spaces met outside quotes since the last character: one space, written when a character follows. */
  let space = false;
  const write = (text: string) => {
    if (space && value !== "") value += " ";
    space = false;
    value += text;
  };
  for (const part of parts) {
    if (part.kind === "tag") {
      write(part.value);
      continue;
    }
    const text = part.value;
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      if (char === "\\") {
        const next = text.charAt(i + 1);
        if (next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
          write(String.fromCharCode(Number.parseInt(text.slice(i + 2, i + 6), 16)));
          i += 5;
        } else {
          write(ESCAPES[next] ?? next);
          i++;
        }
      } else if (char === '"') {
        quoted = !quoted;
      } else if (!quoted && /\s/.test(char)) {
        space = true;
      } else {
        write(char);
      }
    }
  }
  return value;
}

/**
 * The content of a resource for a translation: the known inline tags as they are, the texts escaped for Android
 * and for XML. A translation whose spaces Android would merge (at its ends, or two in a row) is put in quotes.
 */
export function encodeAndroid(parts: readonly InlinePart[], asciiOnly: boolean): string {
  const whole = parts.map((part) => part.value).join("");
  const quote = /^\s|\s$|\s\s/.test(whole);
  let encoded = "";
  parts.forEach((part, index) => {
    if (part.kind === "tag") {
      encoded += part.value;
      return;
    }
    let text = part.value
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("'", "\\'")
      .replaceAll("\n", "\\n")
      .replaceAll("\t", "\\t");
    // A resource that starts with @ or ? is a reference to another resource.
    if (index === 0 && !quote && /^[@?]/.test(text)) text = `\\${text}`;
    encoded += escapeXmlText(text, asciiOnly);
  });
  return quote ? `"${encoded}"` : encoded;
}

const CATEGORY_ORDER = ["zero", "one", "two", "few", "many", "other"];

/** The plural quantities Android expects for a language: its CLDR categories, in their usual order. */
export function pluralQuantities(language: string): string[] {
  let categories: readonly string[];
  try {
    categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  } catch {
    categories = ["one", "other"]; // not a valid language tag
  }
  return CATEGORY_ORDER.filter((category) => categories.includes(category));
}

/** "fr" → "fr", "pt-BR" → "pt-rBR", "zh-Hant-TW" → "b+zh+Hant+TW": the qualifier of a values-… folder. */
export function androidLanguage(language: string): string {
  const parts = language.split(/[-_]/);
  const [base = "", ...rest] = parts;
  const lower = base.toLowerCase();
  if (rest.length === 0) return lower;
  if (rest.length === 1 && /^[A-Za-z]{2}$/.test(rest[0] ?? "")) return `${lower}-r${(rest[0] ?? "").toUpperCase()}`;
  const subtags = rest.map((part) =>
    part.length === 4 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part.toUpperCase(),
  );
  return ["b", lower, ...subtags].join("+");
}

export function attribute(element: XmlElement, name: string): string | undefined {
  return element.attributes.find((attr) => attr.name === name)?.value;
}

function children(element: XmlElement): XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.kind === "element");
}
