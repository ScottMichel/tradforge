import type { Reader } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { parsePo } from "./syntax.js";

/**
 * Reads the msgid of every entry, and its msgid_plural. The existing msgstr are not read: a source catalog is a
 * template (.pot) or the catalog of the source language.
 *
 * The context of the entry (msgctxt) and the notes of the developers (#.) go to the translator as context.
 * Entries that differ only by their msgctxt still share one translation, since the memory knows texts, not contexts.
 */
export const poReader: Reader = {
  format: "po",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const entry of parsePo(file, content)) {
      if (entry.id === "") continue; // the header
      const hints = [context, entry.context, ...entry.comments].filter((hint) => hint !== undefined && hint !== "");
      const shared = {
        priority,
        ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
      };
      const key = entry.context !== undefined ? { key: entry.context } : {};
      const group = entry.plural !== undefined ? { group: `${file}#${entry.line}` } : {};
      occurrences.push({ source: entry.id, location: { file, ...key, line: entry.line }, ...shared, ...group });
      if (entry.plural !== undefined && entry.plural !== "") {
        const line = entry.pluralLine ?? entry.line;
        occurrences.push({ source: entry.plural, location: { file, ...key, line }, ...shared, ...group });
      }
    }
    return occurrences;
  },
};
