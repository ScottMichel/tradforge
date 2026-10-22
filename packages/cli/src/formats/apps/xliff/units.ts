import { ReadError, stripBom } from "../../../core/reader.js";
import { flattenInline } from "../../shared/xml/inline.js";
import { parseXml, type XmlElement, XmlSyntaxError } from "../../shared/xml/parser.js";

/**
 * XLIFF, the exchange format of translation tools, in its two families:
 *
 *   1.2: <xliff version="1.2"><file source-language="en" target-language="fr"><body>
 *          <trans-unit id="title"><source>Text</source><target>Texte</target><note>...</note></trans-unit>
 *   2.x: <xliff version="2.0" srcLang="en" trgLang="fr"><file id="f1">
 *          <unit id="title"><notes><note>...</note></notes><segment><source>Text</source><target>Texte</target>
 *
 * Both may nest units in <group> elements. A source may hold inline elements (<x/>, <g>, <ph>, <pc>, <mrk>...):
 * they stand for code or markup of the application and must come back in the translation.
 */

/** One source text, with what a writer needs to put its translation in place. */
export interface XliffText {
  /** The text sent to the translator: inline tags as they are written, text decoded, outer spaces trimmed. */
  readonly value: string;
  /** Spaces around the text in the source, given back around the translation. */
  readonly leading: string;
  readonly trailing: string;
  /** Every inline tag of the source as it is written: they are copied as they are into the target. */
  readonly tags: readonly string[];
  readonly key: string;
  readonly line: number;
  readonly notes: readonly string[];
  readonly group?: string;
  readonly source: XmlElement;
  readonly target?: XmlElement;
  /** The 2.x segment that holds the source; absent in 1.2. */
  readonly segment?: XmlElement;
  /** The trans-unit (1.2) or unit (2.x): left out as a whole with "omit". */
  readonly unit: XmlElement;
}

export interface XliffDocument {
  readonly version: 1 | 2;
  readonly root: XmlElement;
  /** The elements that name the target language: each <file> in 1.2, the root in 2.x. */
  readonly languageHolders: readonly XmlElement[];
  readonly texts: readonly XliffText[];
}

/** The byte order mark is left out: the offsets of the elements are relative to the text without it. */
export function parseXliff(file: string, content: string): XliffDocument {
  const text = stripBom(content);
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (error) {
    if (error instanceof XmlSyntaxError) throw new ReadError(file, error.message, { cause: error });
    throw error;
  }
  if (localName(root) !== "xliff") throw new ReadError(file, `not an XLIFF document (its root is <${root.name}>)`);
  const version = attribute(root, "version") ?? "";
  const family = /^1\.[0-2]$/.test(version) ? 1 : /^2\.\d$/.test(version) ? 2 : undefined;
  if (family === undefined) throw new ReadError(file, `unsupported XLIFF version ${version || "(none)"}`);

  const texts: XliffText[] = [];
  const files = elements(root, "file");
  for (const fileElement of files) {
    if (family === 1) for (const body of elements(fileElement, "body")) readUnits12(text, body, undefined, texts);
    else readUnits2(text, fileElement, undefined, texts);
  }
  return { version: family, root, languageHolders: family === 1 ? files : [root], texts };
}

function readUnits12(src: string, parent: XmlElement, group: string | undefined, texts: XliffText[]): void {
  for (const child of childElements(parent)) {
    const name = localName(child);
    if (name === "group") {
      if (attribute(child, "translate") !== "no") readUnits12(src, child, attribute(child, "id") ?? group, texts);
    } else if (name === "trans-unit" && attribute(child, "translate") !== "no") {
      const source = elements(child, "source")[0];
      if (source === undefined) continue;
      const target = elements(child, "target")[0];
      const notes = elements(child, "note")
        .map(textOf)
        .filter((note) => note !== "");
      const key = attribute(child, "resname") ?? attribute(child, "id") ?? String(source.line);
      const found = inline(src, source, key, notes, child, group);
      if (found !== undefined) texts.push({ ...found, ...(target !== undefined ? { target } : {}) });
    }
  }
}

function readUnits2(src: string, parent: XmlElement, group: string | undefined, texts: XliffText[]): void {
  for (const child of childElements(parent)) {
    const name = localName(child);
    if (name === "group") {
      if (attribute(child, "translate") !== "no") readUnits2(src, child, attribute(child, "id") ?? group, texts);
    } else if (name === "unit" && attribute(child, "translate") !== "no") {
      const id = attribute(child, "id") ?? String(child.line);
      const notes = elements(child, "notes")
        .flatMap((holder) => elements(holder, "note"))
        .map(textOf)
        .filter((note) => note !== "");
      const segments = elements(child, "segment");
      // Several segments of one unit make one text together: they are translated in one batch.
      const unitGroup = segments.length > 1 ? id : group;
      segments.forEach((segment, index) => {
        const source = elements(segment, "source")[0];
        if (source === undefined) return;
        const target = elements(segment, "target")[0];
        const key = segments.length > 1 ? `${id}/${attribute(segment, "id") ?? index + 1}` : id;
        const found = inline(src, source, key, notes, child, unitGroup);
        if (found !== undefined) texts.push({ ...found, segment, ...(target !== undefined ? { target } : {}) });
      });
    }
  }
}

/** The text of a source with its inline tags, or undefined when it holds nothing but spaces. */
function inline(
  src: string,
  source: XmlElement,
  key: string,
  notes: readonly string[],
  unit: XmlElement,
  group: string | undefined,
): Omit<XliffText, "target" | "segment"> | undefined {
  const { text: raw, tags } = flattenInline(src, source);
  const value = raw.trim();
  if (value === "") return undefined;
  const leading = raw.slice(0, raw.length - raw.trimStart().length);
  const trailing = raw.slice(raw.trimEnd().length);
  return {
    value,
    leading,
    trailing,
    tags,
    key,
    line: source.line,
    notes,
    ...(group !== undefined ? { group } : {}),
    source,
    unit,
  };
}

/** Plain text of an element (a note), tags left out. */
function textOf(element: XmlElement): string {
  let value = "";
  for (const child of element.children) {
    if (child.kind === "text" || child.kind === "cdata") value += child.value;
    else if (child.kind === "element") value += textOf(child);
  }
  return value.trim();
}

/** The name without its namespace prefix: "xlf:source" → "source". */
export function localName(element: XmlElement): string {
  const colon = element.name.indexOf(":");
  return colon === -1 ? element.name : element.name.slice(colon + 1);
}

export function attribute(element: XmlElement, name: string): string | undefined {
  return element.attributes.find((attr) => attr.name === name)?.value;
}

function childElements(element: XmlElement): XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.kind === "element");
}

function elements(element: XmlElement, name: string): XmlElement[] {
  return childElements(element).filter((child) => localName(child) === name);
}
