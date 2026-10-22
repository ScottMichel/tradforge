import type { Reader } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { isMessageFormat, parseProperties } from "./syntax.js";

/**
 * Reads every non-empty value of a .properties file; the comment above an entry goes to the translator as context.
 * In a MessageFormat text (one with {0} arguments), Java reads '' as one apostrophe: the translator gets the text
 * as people read it, and the writer doubles the apostrophes again.
 */
export const propertiesReader: Reader = {
  format: "properties",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const entry of parseProperties(content)) {
      if (entry.value.trim() === "") continue;
      const hints = [context, entry.comment].filter((hint) => hint !== undefined && hint !== "");
      occurrences.push({
        source: isMessageFormat(entry.value) ? entry.value.replaceAll("''", "'") : entry.value,
        location: { file, key: entry.key, line: entry.line },
        priority,
        ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
      });
    }
    return occurrences;
  },
};
