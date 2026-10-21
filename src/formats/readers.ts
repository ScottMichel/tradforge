import type { SourceFormat } from "../core/config.js";
import type { Reader } from "../core/reader.js";
import { androidReader } from "./android/reader.js";
import { arbReader } from "./arb/reader.js";
import { iosStringsReader } from "./ios/reader.js";
import { jsonReader } from "./json/reader.js";
import { luaReader } from "./lua/reader.js";
import { markdownReader } from "./markdown/reader.js";
import { paradoxReader } from "./paradox/reader.js";
import { poReader } from "./po/reader.js";
import { propertiesReader } from "./properties/reader.js";
import { pzReader } from "./pz/reader.js";
import { renpyReader } from "./renpy/reader.js";
import { resxReader } from "./resx/reader.js";
import { rimworldReader } from "./rimworld/reader.js";
import { srtReader } from "./srt/reader.js";
import { vttReader } from "./vtt/reader.js";
import { xcstringsReader } from "./xcstrings/reader.js";
import { xliffReader } from "./xliff/reader.js";
import { yamlReader } from "./yaml/reader.js";

/** One reader per format. `satisfies` makes a missing format a compile error. */
export const READERS = {
  android: androidReader,
  arb: arbReader,
  "ios-strings": iosStringsReader,
  json: jsonReader,
  lua: luaReader,
  markdown: markdownReader,
  "paradox-yml": paradoxReader,
  po: poReader,
  properties: propertiesReader,
  "zomboid-txt": pzReader,
  renpy: renpyReader,
  resx: resxReader,
  "rimworld-xml": rimworldReader,
  srt: srtReader,
  vtt: vttReader,
  xcstrings: xcstringsReader,
  xliff: xliffReader,
  yaml: yamlReader,
} as const satisfies Record<SourceFormat, Reader>;
