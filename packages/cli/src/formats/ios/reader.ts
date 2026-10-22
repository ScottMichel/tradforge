import type { Reader } from "../../core/reader.js";
import type { Occurrence } from "../../core/types.js";
import { parseIosStrings } from "./strings.js";

/** Reads every non-empty value of a .strings file; the comment of the developer goes to the translator as context. */
export const iosStringsReader: Reader = {
  format: "ios-strings",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const entry of parseIosStrings(file, content)) {
      if (entry.value.trim() === "") continue;
      const hints = [context, entry.comment].filter((hint) => hint !== undefined && hint !== "");
      occurrences.push({
        source: entry.value,
        location: { file, key: entry.key, line: entry.line },
        priority,
        ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
      });
    }
    return occurrences;
  },
};
