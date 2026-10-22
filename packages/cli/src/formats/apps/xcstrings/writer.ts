import { compareCodeUnits } from "../../../core/compare.js";
import { isObject } from "../../../core/json.js";
import type { Writer } from "../../../core/writer.js";
import { pluralQuantities } from "../android/resources.js";
import { type Json, leaves, localization, parseCatalog, xcodeJson } from "./catalog.js";

/**
 * Writes the target language into the catalog itself, as Xcode expects: a string catalog holds every language. Only
 * the localization of the target language changes; the source and the other languages stay as they are.
 *
 * - A string gets the target localization when all its texts are translated; otherwise any existing one is kept,
 *   so that work done in Xcode is never lost. "keep-source" and "omit" both leave it so: Xcode falls back on the
 *   source language by itself.
 * - Plural variations get the categories of the target language, the text for one where the source has one.
 * - The file is written in the layout of Xcode, and returned unchanged when nothing changed. It is UTF-8, as Xcode
 *   writes it: asciiOnly has no effect.
 */
export const xcstringsWriter: Writer = {
  format: "xcstrings",
  write({ file, content, translate, languages }) {
    const catalog = parseCatalog(file, content);
    const target = languages.target;
    let translated = 0;
    let untranslated = 0;
    let changed = false;

    for (const [key, entry] of Object.entries(catalog.strings)) {
      if (!isObject(entry) || entry.shouldTranslate === false) continue;
      const source = localization(entry, catalog.sourceLanguage);
      if (source?.substitutions !== undefined) continue;
      const texts = source === undefined ? [key] : leaves(source, []).map(([, value]) => value);
      const wanted = texts.filter((text) => text.trim() !== "");
      if (wanted.length === 0) continue;
      if (wanted.some((text) => translate(text) === undefined)) {
        untranslated += wanted.length;
        continue;
      }
      translated += wanted.length;
      const built = source === undefined ? unit(translate(key) ?? key) : build(source, translate, target);
      const localizations = isObject(entry.localizations) ? entry.localizations : {};
      // A new object at the same key: the entry keeps its place in the catalog.
      catalog.strings[key] = { ...entry, localizations: sortedByKey({ ...localizations, [target]: built }) };
      changed = true;
    }

    if (!changed) return { content, translated, untranslated };
    let json = xcodeJson(catalog.data);
    if (content.includes("\r\n")) json = json.replaceAll("\n", "\r\n");
    if (/\r?\n$/.test(content)) json += content.endsWith("\r\n") ? "\r\n" : "\n";
    return { content: json, translated, untranslated };
  },
};

function unit(value: string): Json {
  return { stringUnit: { state: "translated", value } };
}

/** The target localization, with the structure of the source one; plural variations in the target's categories. */
function build(node: Json, translate: (source: string) => string | undefined, target: string): Json {
  const stringUnit = node.stringUnit;
  if (isObject(stringUnit) && typeof stringUnit.value === "string") {
    return unit(translate(stringUnit.value) ?? stringUnit.value);
  }
  const variations = isObject(node.variations) ? node.variations : {};
  const result: Json = {};
  for (const [kind, cases] of Object.entries(variations)) {
    if (!isObject(cases)) continue;
    if (kind === "plural") {
      const other = cases.other;
      const plural: Json = {};
      for (const category of pluralQuantities(target)) {
        const child = cases[category] ?? other;
        if (isObject(child)) plural[category] = build(child, translate, target);
      }
      result[kind] = plural;
    } else {
      result[kind] = Object.fromEntries(
        Object.entries(cases).flatMap(([name, child]) =>
          isObject(child) ? [[name, build(child, translate, target)]] : [],
        ),
      );
    }
  }
  return { variations: result };
}

/** Xcode sorts the languages of a string. */
function sortedByKey(object: Json): Json {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => compareCodeUnits(a, b)));
}
