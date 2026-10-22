/** A parsed JSON object, before its fields are checked. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** A plain object: neither null nor an array (both have typeof "object"). */
export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
