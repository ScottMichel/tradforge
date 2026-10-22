import { isObject } from "../../../core/json.js";
import { ReadError, type Reader } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { parseJson } from "../json/reader.js";

/**
 * Flutter's Application Resource Bundles (.arb): a JSON object of messages, each with optional metadata under the
 * same key prefixed with "@" ("@appTitle": { "description": ... }), and global settings under "@@" ("@@locale").
 */
export function parseArb(file: string, content: string): Record<string, unknown> {
  const data = parseJson(file, content);
  if (!isObject(data)) throw new ReadError(file, "an .arb file must hold an object");
  return data;
}

/** Reads every message of an .arb file; its description goes to the translator as context. */
export const arbReader: Reader = {
  format: "arb",
  read({ file, content, priority, context }) {
    const data = parseArb(file, content);
    const occurrences: Occurrence[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("@") || typeof value !== "string" || value.trim() === "") continue;
      const metadata = data[`@${key}`];
      const description = isObject(metadata) && typeof metadata.description === "string" ? metadata.description : "";
      const hints = [context, description].filter((hint) => hint !== undefined && hint !== "");
      occurrences.push({
        source: value,
        location: { file, key },
        priority,
        ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
      });
    }
    return occurrences;
  },
};
