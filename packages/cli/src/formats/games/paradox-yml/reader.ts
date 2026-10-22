import type { Reader } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { parseParadox } from "./syntax.js";

/**
 * Suffixes that tie a key to the key it describes: "my_trait_desc" belongs with "my_trait", "FRA_ADJ" with "FRA".
 * Compared without case.
 */
const COMPANION_SUFFIX = /_(?:desc|name|title|tt|tooltip|text|adj|effect|flavor|flavour)$/i;

export const paradoxReader: Reader = {
  format: "paradox-yml",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const item of parseParadox(file, content)) {
      if (item.kind !== "entry" || item.value.trim() === "") continue;
      occurrences.push({
        source: item.value,
        location: { file, key: item.key, line: item.line },
        priority,
        ...(context !== undefined ? { context } : {}),
        group: `${file}#${groupKey(item.key)}`,
      });
    }
    return occurrences;
  },
};

/**
 * Texts that belong together: the parts of an event share the key up to its last dot ("my_event.1.t", ".d", ".a"
 * → "my_event.1"); otherwise a name and its description share the key without a known suffix ("my_trait",
 * "my_trait_desc" → "my_trait").
 */
export function groupKey(key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot > 0) return key.slice(0, dot);
  return key.replace(COMPANION_SUFFIX, "") || key;
}
