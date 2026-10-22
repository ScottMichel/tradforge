import { ReadError, stripBom } from "../../../core/reader.js";
import { parseXml, type XmlElement, XmlSyntaxError } from "../../shared/xml/parser.js";

/** A text element of a RimWorld language file. */
export interface RimWorldText {
  /** Path of the element below the root: "TF_Key", "TF_Def.label", "TF_Def.rulesStrings.0". */
  readonly key: string;
  /** The text as the game shows it: entities decoded, literal "\n" turned into line breaks, edges trimmed. */
  readonly value: string;
  readonly element: XmlElement;
  /**
   * The part of the source to replace with a translation: the content of the element without the spaces around it,
   * so that the indentation of a multi-line element stays.
   */
  readonly replaceStart: number;
  readonly replaceEnd: number;
  /** The text is one CDATA section: a writer can keep that form. */
  readonly cdata: boolean;
}

/** The root element of the files that hold translations. LanguageInfo.xml and defs have other roots. */
export const LANGUAGE_DATA = "LanguageData";

const EDGE_SPACES = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/**
 * Every non-blank text element of a RimWorld language file (content without byte order mark), in document order.
 * Errors name the file and the line.
 */
export function extractRimWorldTexts(file: string, content: string): RimWorldText[] {
  let root: XmlElement;
  try {
    root = parseXml(content);
  } catch (error) {
    if (error instanceof XmlSyntaxError) throw new ReadError(file, `invalid XML (${error.message})`, { cause: error });
    throw error;
  }
  if (root.name !== LANGUAGE_DATA) return [];
  const texts: RimWorldText[] = [];
  for (const [child, segment] of childPaths(root)) collect(file, content, child, segment, texts);
  return texts;
}

/** Parses a file that may start with a byte order mark: offsets are relative to the text without it. */
export function withoutBom(content: string): { readonly bom: string; readonly text: string } {
  const text = stripBom(content);
  return { bom: content.slice(0, content.length - text.length), text };
}

/** The child elements with their path segment: their name, or their index for list items (<li>). */
function childPaths(element: XmlElement): [XmlElement, string][] {
  let index = 0;
  const paths: [XmlElement, string][] = [];
  for (const child of element.children) {
    if (child.kind !== "element") continue;
    paths.push([child, child.name === "li" ? String(index++) : child.name]);
  }
  return paths;
}

function collect(file: string, content: string, element: XmlElement, key: string, texts: RimWorldText[]): void {
  const children = childPaths(element);
  if (children.length > 0) {
    const text = element.children.find(
      (child) => child.kind === "cdata" || (child.kind === "text" && child.value.trim() !== ""),
    );
    if (text !== undefined) {
      const reason = `line ${element.line}: <${element.name}> mixes text and elements; write markup as &lt;b&gt;`;
      throw new ReadError(file, `invalid RimWorld file (${reason})`);
    }
    for (const [child, segment] of children) collect(file, content, child, `${key}.${segment}`, texts);
    return;
  }

  const raw = element.children
    .map((child) => (child.kind === "text" || child.kind === "cdata" ? child.value : ""))
    .join("");
  const value = raw.replace(EDGE_SPACES, "").replaceAll("\\n", "\n");
  if (value === "") return;

  const inner = content.slice(element.contentStart, element.contentEnd);
  const leading = /^[ \t\r\n]*/.exec(inner)?.[0].length ?? 0;
  const trailing = /[ \t\r\n]*$/.exec(inner)?.[0].length ?? 0;
  const meaningful = element.children.filter((child) => !(child.kind === "text" && child.value.trim() === ""));
  texts.push({
    key,
    value,
    element,
    replaceStart: element.contentStart + leading,
    replaceEnd: element.contentEnd - trailing,
    cdata: meaningful.length === 1 && meaningful[0]?.kind === "cdata",
  });
}
