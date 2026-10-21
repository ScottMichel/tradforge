import { isObject } from "../../core/json.js";
import { ReadError } from "../../core/reader.js";
import { parseJson } from "../json/reader.js";

/**
 * Xcode string catalogs (.xcstrings, Xcode 15 and later): one JSON file for every language of the app.
 *
 *   "strings" : {
 *     "app_name" : {
 *       "comment" : "Title of the main window",
 *       "localizations" : {
 *         "en" : { "stringUnit" : { "state" : "translated", "value" : "The Cold Forge" } },
 *         "fr" : { "stringUnit" : { ... } }
 *       }
 *     },
 *     "Welcome back, %@!" : { }          the key is the source text when it has no source localization
 *
 * A localization holds a stringUnit, or variations ("plural" by category, "device" by device), which hold
 * localizations in turn. Substitutions (several plurals in one text) are not supported: such strings are left out.
 */

export type Json = Record<string, unknown>;

export interface Catalog {
  readonly sourceLanguage: string;
  readonly strings: Json;
  readonly data: Json;
}

/** One text of the source language: a stringUnit, at a path of variations ("plural/one"). */
export interface CatalogText {
  readonly key: string;
  readonly variation: readonly string[];
  readonly value: string;
  readonly comment?: string;
}

export function parseCatalog(file: string, content: string): Catalog {
  const data = parseJson(file, content);
  if (!isObject(data) || typeof data.sourceLanguage !== "string" || !isObject(data.strings)) {
    throw new ReadError(file, 'not a string catalog (no "sourceLanguage" and "strings")');
  }
  return { sourceLanguage: data.sourceLanguage, strings: data.strings, data };
}

/** Every text to translate, in the order of the catalog. */
export function catalogTexts(catalog: Catalog): CatalogText[] {
  const texts: CatalogText[] = [];
  for (const [key, entry] of Object.entries(catalog.strings)) {
    if (!isObject(entry) || entry.shouldTranslate === false) continue;
    const comment = typeof entry.comment === "string" && entry.comment.trim() !== "" ? entry.comment : undefined;
    const source = localization(entry, catalog.sourceLanguage);
    if (source === undefined) {
      if (key.trim() !== "")
        texts.push({ key, variation: [], value: key, ...(comment !== undefined ? { comment } : {}) });
      continue;
    }
    if (source.substitutions !== undefined) continue;
    for (const [variation, value] of leaves(source, [])) {
      if (value.trim() !== "") texts.push({ key, variation, value, ...(comment !== undefined ? { comment } : {}) });
    }
  }
  return texts;
}

export function localization(entry: Json, language: string): Json | undefined {
  const localizations = entry.localizations;
  if (!isObject(localizations)) return undefined;
  const found = localizations[language];
  return isObject(found) ? found : undefined;
}

/** The values of a localization: its stringUnit, or those of its variations, with their path. */
export function leaves(node: Json, path: readonly string[]): [string[], string][] {
  const unit = node.stringUnit;
  if (isObject(unit) && typeof unit.value === "string") return [[[...path], unit.value]];
  const variations = node.variations;
  if (!isObject(variations)) return [];
  const found: [string[], string][] = [];
  for (const [kind, cases] of Object.entries(variations)) {
    if (!isObject(cases)) continue;
    for (const [name, child] of Object.entries(cases)) {
      if (isObject(child)) found.push(...leaves(child, [...path, kind, name]));
    }
  }
  return found;
}

/**
 * JSON in the layout Xcode writes: two spaces, a space on each side of the colon, and an empty object written
 * on three lines. Keys keep their order.
 */
export function xcodeJson(value: unknown, indent = ""): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inner = `${indent}  `;
    return `[\n${value.map((item) => inner + xcodeJson(item, inner)).join(",\n")}\n${indent}]`;
  }
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return `{\n\n${indent}}`;
    const inner = `${indent}  `;
    const lines = entries.map(([key, item]) => `${inner}${JSON.stringify(key)} : ${xcodeJson(item, inner)}`);
    return `{\n${lines.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}
