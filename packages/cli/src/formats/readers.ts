import type { SourceFormat } from "../core/config.js";
import type { BinaryReader, Reader } from "../core/reader.js";
import { androidReader } from "./apps/android/reader.js";
import { arbReader } from "./apps/arb/reader.js";
import { iosStringsReader } from "./apps/ios-strings/reader.js";
import { jsonReader } from "./apps/json/reader.js";
import { poReader } from "./apps/po/reader.js";
import { propertiesReader } from "./apps/properties/reader.js";
import { resxReader } from "./apps/resx/reader.js";
import { xcstringsReader } from "./apps/xcstrings/reader.js";
import { xliffReader } from "./apps/xliff/reader.js";
import { yamlReader } from "./apps/yaml/reader.js";
import { docxReader } from "./documents/docx/reader.js";
import { htmlReader } from "./documents/html/reader.js";
import { markdownReader } from "./documents/markdown/reader.js";
import { odtReader } from "./documents/odt/reader.js";
import { pptxReader } from "./documents/pptx/reader.js";
import { xlsxReader } from "./documents/xlsx/reader.js";
import { luaReader } from "./games/lua/reader.js";
import { paradoxReader } from "./games/paradox-yml/reader.js";
import { renpyReader } from "./games/renpy/reader.js";
import { rimworldReader } from "./games/rimworld-xml/reader.js";
import { pzReader } from "./games/zomboid-txt/reader.js";
import { srtReader } from "./subtitles/srt/reader.js";
import { vttReader } from "./subtitles/vtt/reader.js";

/** One reader per format. `satisfies` makes a missing format a compile error. */
export const READERS = {
  android: androidReader,
  arb: arbReader,
  docx: docxReader,
  html: htmlReader,
  "ios-strings": iosStringsReader,
  json: jsonReader,
  lua: luaReader,
  markdown: markdownReader,
  odt: odtReader,
  "paradox-yml": paradoxReader,
  po: poReader,
  pptx: pptxReader,
  properties: propertiesReader,
  "zomboid-txt": pzReader,
  renpy: renpyReader,
  resx: resxReader,
  "rimworld-xml": rimworldReader,
  srt: srtReader,
  vtt: vttReader,
  xcstrings: xcstringsReader,
  xliff: xliffReader,
  xlsx: xlsxReader,
  yaml: yamlReader,
} as const satisfies Record<SourceFormat, Reader | BinaryReader>;

/** The reader of a format, text or binary: callers tell them apart with isBinary. */
export function readerFor(format: SourceFormat): Reader | BinaryReader {
  return READERS[format];
}
