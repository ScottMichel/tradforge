import type { SourceFormat } from "../core/config.js";
import type { Reader } from "../core/reader.js";
import { androidReader } from "./android/reader.js";
import { jsonReader } from "./json/reader.js";
import { luaReader } from "./lua/reader.js";
import { paradoxReader } from "./paradox/reader.js";
import { poReader } from "./po/reader.js";
import { pzReader } from "./pz/reader.js";
import { renpyReader } from "./renpy/reader.js";
import { rimworldReader } from "./rimworld/reader.js";
import { srtReader } from "./srt/reader.js";
import { vttReader } from "./vtt/reader.js";
import { xliffReader } from "./xliff/reader.js";
import { yamlReader } from "./yaml/reader.js";

/** One reader per format. `satisfies` makes a missing format a compile error. */
export const READERS = {
  android: androidReader,
  json: jsonReader,
  lua: luaReader,
  "paradox-yml": paradoxReader,
  po: poReader,
  "zomboid-txt": pzReader,
  renpy: renpyReader,
  "rimworld-xml": rimworldReader,
  srt: srtReader,
  vtt: vttReader,
  xliff: xliffReader,
  yaml: yamlReader,
} as const satisfies Record<SourceFormat, Reader>;
