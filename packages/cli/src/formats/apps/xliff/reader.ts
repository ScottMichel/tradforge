import type { Reader } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { parseXliff } from "./units.js";

/**
 * Reads the source of every unit (XLIFF 1.2 trans-unit, XLIFF 2 segment), except those marked translate="no".
 * The notes of the unit go to the translator as context; inline tags stay in the text, and the validation checks
 * that they all come back.
 */
export const xliffReader: Reader = {
  format: "xliff",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const text of parseXliff(file, content).texts) {
      const hints = [context, ...text.notes].filter((hint) => hint !== undefined && hint !== "");
      occurrences.push({
        source: text.value,
        location: { file, key: text.key, line: text.line },
        priority,
        ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
        ...(text.group !== undefined ? { group: `${file}#${text.group}` } : {}),
      });
    }
    return occurrences;
  },
};
