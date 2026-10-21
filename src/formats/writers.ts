import type { SourceFormat } from "../core/config.js";
import type { Writer } from "../core/writer.js";
import { androidWriter } from "./android/writer.js";
import { arbWriter } from "./arb/writer.js";
import { iosStringsWriter } from "./ios/writer.js";
import { jsonWriter } from "./json/writer.js";
import { luaWriter } from "./lua/writer.js";
import { paradoxWriter } from "./paradox/writer.js";
import { poWriter } from "./po/writer.js";
import { propertiesWriter } from "./properties/writer.js";
import { pzWriter } from "./pz/writer.js";
import { renpyWriter } from "./renpy/writer.js";
import { resxWriter } from "./resx/writer.js";
import { rimworldWriter } from "./rimworld/writer.js";
import { srtWriter } from "./srt/writer.js";
import { vttWriter } from "./vtt/writer.js";
import { xliffWriter } from "./xliff/writer.js";
import { yamlWriter } from "./yaml/writer.js";

/** One writer per format. `satisfies` makes a missing format a compile error. */
export const WRITERS = {
  android: androidWriter,
  arb: arbWriter,
  "ios-strings": iosStringsWriter,
  json: jsonWriter,
  lua: luaWriter,
  "paradox-yml": paradoxWriter,
  po: poWriter,
  properties: propertiesWriter,
  "zomboid-txt": pzWriter,
  renpy: renpyWriter,
  resx: resxWriter,
  "rimworld-xml": rimworldWriter,
  srt: srtWriter,
  vtt: vttWriter,
  xliff: xliffWriter,
  yaml: yamlWriter,
} as const satisfies Record<SourceFormat, Writer>;
