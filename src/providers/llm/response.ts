import { isObject } from "../../core/json.js";
import { BatchError } from "../../core/provider.js";

/** Some models wrap their JSON in a Markdown code block despite the instructions. */
const CODE_BLOCK = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/;

/**
 * Reads the model answer: {"translations":[{"id":0,"translation":"..."}]}.
 * Unknown ids, repeated ids and non-text translations are ignored; an unreadable answer is a BatchError.
 */
export function parseTranslations(content: string, expectedIds: readonly number[]): Map<number, string> {
  const json = CODE_BLOCK.exec(content)?.[1] ?? content;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new BatchError(`the model answer is not valid JSON (${detail})`, { cause: error });
  }

  const translations: unknown = isObject(data) ? data.translations : undefined;
  if (!Array.isArray(translations)) throw new BatchError('the model answer has no "translations" array');

  const expected = new Set(expectedIds);
  const result = new Map<number, string>();
  const items: unknown[] = translations;
  for (const item of items) {
    if (!isObject(item) || typeof item.id !== "number" || typeof item.translation !== "string") continue;
    if (expected.has(item.id) && !result.has(item.id)) result.set(item.id, item.translation);
  }
  return result;
}
