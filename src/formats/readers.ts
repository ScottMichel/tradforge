import type { SourceFormat } from "../core/config.js";
import type { Reader } from "../core/reader.js";
import { jsonReader } from "./json/reader.js";
import { luaReader } from "./lua/reader.js";

/** One reader per format. `satisfies` makes a missing format a compile error. */
export const READERS = {
  json: jsonReader,
  lua: luaReader,
} as const satisfies Record<SourceFormat, Reader>;
