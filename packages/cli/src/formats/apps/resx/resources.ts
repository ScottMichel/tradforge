import { ReadError, stripBom } from "../../../core/reader.js";
import { parseXml, type XmlElement, XmlSyntaxError } from "../../shared/xml/parser.js";

/**
 * .NET resource files (.resx):
 *
 *   <data name="AppName" xml:space="preserve">
 *     <value>The Cold Forge</value>
 *     <comment>Title of the main window</comment>
 *   </data>
 *
 * Only strings are texts: data with a type or a mimetype holds a file or a serialized object, and names that start
 * with ">>" or "$this." are properties of the Windows Forms designer.
 */
export interface ResxString {
  readonly name: string;
  readonly value: string;
  readonly comment?: string;
  /** The <data> element, left out with "omit". */
  readonly data: XmlElement;
  /** The <value> element, whose content holds the text. */
  readonly element: XmlElement;
}

export function parseResx(file: string, content: string): ResxString[] {
  let root: XmlElement;
  try {
    root = parseXml(stripBom(content));
  } catch (error) {
    if (error instanceof XmlSyntaxError) throw new ReadError(file, error.message, { cause: error });
    throw error;
  }
  if (root.name !== "root") throw new ReadError(file, `not a .resx file (its root is <${root.name}>)`);

  const strings: ResxString[] = [];
  for (const data of elements(root, "data")) {
    const name = attribute(data, "name") ?? "";
    if (attribute(data, "type") !== undefined || attribute(data, "mimetype") !== undefined) continue;
    if (name.startsWith(">>") || name.startsWith("$this.") || name === "") continue;
    const element = elements(data, "value")[0];
    if (element === undefined || element.selfClosing) continue;
    const value = textOf(element);
    if (value.trim() === "") continue;
    const comment = elements(data, "comment")[0];
    const note = comment === undefined ? "" : textOf(comment).trim();
    strings.push({ name, value, ...(note !== "" ? { comment: note } : {}), data, element });
  }
  return strings;
}

function textOf(element: XmlElement): string {
  return element.children.map((child) => (child.kind === "text" || child.kind === "cdata" ? child.value : "")).join("");
}

function attribute(element: XmlElement, name: string): string | undefined {
  return element.attributes.find((attr) => attr.name === name)?.value;
}

function elements(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.kind === "element" && child.name === name);
}
