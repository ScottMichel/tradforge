import type { Writer } from "../../../core/writer.js";
import { parseJson } from "./reader.js";

/** Marks a value to leave out of its parent object. */
const OMIT = Symbol("omit");

export const jsonWriter: Writer = {
  format: "json",
  write({ file, content, translate, options }) {
    const data = parseJson(file, content);
    let translated = 0;
    let untranslated = 0;

    const replace = (text: string): string | typeof OMIT => {
      if (text.trim() === "") return text; // never extracted, so never translated
      const translation = translate(text);
      if (translation !== undefined) {
        translated++;
        return translation;
      }
      untranslated++;
      return options.untranslated === "omit" ? OMIT : text;
    };

    const result = mapStrings(data, replace);
    return {
      content: serializeJson(result === OMIT ? data : result, content, options.asciiOnly),
      translated,
      untranslated,
    };
  },
};

/** JSON written like its source: same indentation, same line ends, final line break kept; asciiOnly gives \u. */
export function serializeJson(value: unknown, source: string, asciiOnly: boolean): string {
  let json = JSON.stringify(value, null, detectIndent(source));
  if (asciiOnly) json = escapeNonAscii(json);
  // Raw line breaks only exist between JSON tokens (inside strings they are escaped), so this is safe.
  if (source.includes("\r\n")) json = json.replaceAll("\n", "\r\n");
  if (/\r?\n$/.test(source)) json += source.endsWith("\r\n") ? "\r\n" : "\n";
  return json;
}

/** Rebuilds a JSON value with every string passed through replace. Array items are never left out. */
function mapStrings(value: unknown, replace: (text: string) => string | typeof OMIT): unknown {
  if (typeof value === "string") return replace(value);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => {
      const mapped = mapStrings(item, replace);
      return mapped === OMIT ? item : mapped; // omitting would shift the indexes of the next items
    });
  }
  if (typeof value === "object" && value !== null) {
    const entries: [string, unknown][] = [];
    for (const [key, item] of Object.entries(value)) {
      const mapped = mapStrings(item, replace);
      if (mapped !== OMIT) entries.push([key, mapped]);
    }
    return Object.fromEntries(entries); // own properties: a "__proto__" key stays a plain key
  }
  return value;
}

/** The indentation of the first indented line (spaces or tab), 2 spaces by default. */
function detectIndent(content: string): string {
  return /^([ \t]+)\S/m.exec(content)?.[1] ?? "  ";
}

/** \u escapes for every character above ASCII; characters outside the BMP become two escaped surrogates. */
function escapeNonAscii(json: string): string {
  // With the u flag a character outside the BMP comes as one match of two UTF-16 units: escape each unit.
  return json.replace(/[\u{80}-\u{10ffff}]/gu, (char) =>
    char
      .split("")
      .map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .join(""),
  );
}
