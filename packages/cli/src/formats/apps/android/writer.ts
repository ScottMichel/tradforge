import { stripBom } from "../../../core/reader.js";
import type { Writer } from "../../../core/writer.js";
import { splitByTags } from "../../shared/xml/inline.js";
import type { XmlElement } from "../../shared/xml/parser.js";
import { type AndroidResource, type AndroidText, encodeAndroid, parseAndroid, pluralQuantities } from "./resources.js";

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Writes each translation in the content of its element; comments, attributes and other resources stay byte for
 * byte.
 *
 * - Resources marked translatable="false" are left out: Android takes them from values/, and lint reports them in a
 *   translation.
 * - A plural gets the quantities of the target language (one, few, many, other...): the text for one where the
 *   source has one, the text for other everywhere else.
 * - With "omit", an untranslated string or plural is left out; an array with one translated item keeps the others,
 *   so that the indexes do not shift.
 */
export const androidWriter: Writer = {
  format: "android",
  write({ file, content, translate, options, languages }) {
    const text = stripBom(content); // the offsets of parseAndroid are relative to the text without BOM
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const edits: Edit[] = [];
    let translated = 0;
    let untranslated = 0;
    const encode = (found: AndroidText, translation: string) =>
      encodeAndroid(splitByTags(translation, found.tags), options.asciiOnly);

    for (const resource of parseAndroid(file, text)) {
      if (!resource.translatable) {
        edits.push(removeElement(text, resource.element));
        continue;
      }
      if (resource.texts.length === 0) continue;
      const translations = resource.texts.map((found) => translate(found.value));
      const done = translations.filter((translation) => translation !== undefined).length;
      if (resource.kind === "plurals") {
        const plural = pluralEdit(text, resource, translations, languages.target, eol, encode);
        if (plural === undefined) {
          untranslated += resource.texts.length;
          if (options.untranslated === "omit") edits.push(removeElement(text, resource.element));
        } else {
          translated += resource.texts.length;
          edits.push(plural);
        }
        continue;
      }
      if (done === 0 && options.untranslated === "omit") {
        untranslated += resource.texts.length;
        edits.push(removeElement(text, resource.element));
        continue;
      }
      resource.texts.forEach((found, index) => {
        const translation = translations[index];
        if (translation === undefined) {
          untranslated++;
          return;
        }
        translated++;
        edits.push({
          start: found.element.contentStart,
          end: found.element.contentEnd,
          text: encode(found, translation),
        });
      });
    }

    let output = "";
    let copied = 0;
    for (const edit of edits.sort((a, b) => a.start - b.start)) {
      output += text.slice(copied, edit.start) + edit.text;
      copied = edit.end;
    }
    return { content: output + text.slice(copied), translated, untranslated };
  },
};

/** The items of a plural for the target language, or undefined when the text for "other" is not translated. */
function pluralEdit(
  src: string,
  resource: AndroidResource,
  translations: readonly (string | undefined)[],
  target: string,
  eol: string,
  encode: (found: AndroidText, translation: string) => string,
): Edit | undefined {
  const byQuantity = new Map<string, { found: AndroidText; translation: string | undefined }>();
  resource.texts.forEach((found, index) => {
    byQuantity.set(resource.quantities[index] ?? "other", { found, translation: translations[index] });
  });
  const other = byQuantity.get("other");
  if (other?.translation === undefined) return undefined;
  if ([...byQuantity.values()].some((entry) => entry.translation === undefined)) return undefined;

  const first = resource.texts[0]?.element;
  const last = resource.texts.at(-1)?.element;
  if (first === undefined || last === undefined) return undefined;
  const indent = src.slice(src.lastIndexOf("\n", first.start - 1) + 1, first.start);
  const separator = /^[ \t]*$/.test(indent) ? eol + indent : "";
  const items = pluralQuantities(target).map((quantity) => {
    const entry = byQuantity.get(quantity) ?? other;
    return `<item quantity="${quantity}">${encode(entry.found, entry.translation ?? "")}</item>`;
  });
  return { start: first.start, end: last.end, text: items.join(separator) };
}

/** Removes an element, and its whole line when it stands alone on it. */
function removeElement(src: string, element: XmlElement): Edit {
  const lineStart = src.lastIndexOf("\n", element.start - 1) + 1;
  const before = src.slice(lineStart, element.start);
  const after = /^[ \t]*\r?\n/.exec(src.slice(element.end))?.[0];
  if (!/^[ \t]*$/.test(before) || after === undefined) return { start: element.start, end: element.end, text: "" };
  return { start: lineStart, end: element.end + after.length, text: "" };
}
