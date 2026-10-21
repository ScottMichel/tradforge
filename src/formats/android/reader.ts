import type { Reader } from "../../core/reader.js";
import type { Occurrence } from "../../core/types.js";
import { parseAndroid } from "./resources.js";

/**
 * Reads every translatable string, string array item and plural quantity of an Android resource file, decoded as
 * Android reads it. The items of an array or a plural are translated together.
 */
export const androidReader: Reader = {
  format: "android",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const resource of parseAndroid(file, content)) {
      if (!resource.translatable) continue;
      for (const text of resource.texts) {
        occurrences.push({
          source: text.value,
          location: { file, key: text.key, line: text.line },
          priority,
          ...(context !== undefined ? { context } : {}),
          ...(resource.kind !== "string" ? { group: `${file}#${resource.name}` } : {}),
        });
      }
    }
    return occurrences;
  },
};
