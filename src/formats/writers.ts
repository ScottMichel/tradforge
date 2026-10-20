import type { SourceFormat } from "../core/config.js";
import type { Writer } from "../core/writer.js";
import { jsonWriter } from "./json/writer.js";
import { luaWriter } from "./lua/writer.js";
import { paradoxWriter } from "./paradox/writer.js";
import { pzWriter } from "./pz/writer.js";
import { renpyWriter } from "./renpy/writer.js";
import { rimworldWriter } from "./rimworld/writer.js";
import { srtWriter } from "./srt/writer.js";
import { vttWriter } from "./vtt/writer.js";

/** One writer per format. `satisfies` makes a missing format a compile error. */
export const WRITERS = {
  json: jsonWriter,
  lua: luaWriter,
  "paradox-yml": paradoxWriter,
  "zomboid-txt": pzWriter,
  renpy: renpyWriter,
  "rimworld-xml": rimworldWriter,
  srt: srtWriter,
  vtt: vttWriter,
} as const satisfies Record<SourceFormat, Writer>;
