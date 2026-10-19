import { ReadError, type Reader, stripBom } from "../../core/reader.js";
import type { Occurrence } from "../../core/types.js";

export const jsonReader: Reader = {
  format: "json",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const { path, source } of stringsIn(parseJson(file, content), [])) {
      occurrences.push({
        source,
        location: path.length > 0 ? { file, key: path.join(".") } : { file },
        priority,
        ...(context !== undefined ? { context } : {}),
      });
    }
    return occurrences;
  },
};

/** Parses a JSON source file; errors name the file. */
export function parseJson(file: string, content: string): unknown {
  try {
    return JSON.parse(stripBom(content));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReadError(file, `invalid JSON (${detail})`, { cause: error });
  }
}

/** Walks any JSON value and yields every non-blank string, in document order. */
function* stringsIn(value: unknown, path: readonly string[]): Generator<{ path: readonly string[]; source: string }> {
  if (typeof value === "string") {
    if (value.trim() !== "") yield { path, source: value };
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* stringsIn(item, [...path, String(index)]);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) yield* stringsIn(item, [...path, key]);
  }
}
