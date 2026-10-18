import type { SourceFormat } from "../core/config.js";
import type { Writer } from "../core/writer.js";
import { jsonWriter } from "./json/writer.js";
import { luaWriter } from "./lua/writer.js";

/** One writer per format. `satisfies` makes a missing format a compile error. */
export const WRITERS = {
  json: jsonWriter,
  lua: luaWriter,
} as const satisfies Record<SourceFormat, Writer>;
