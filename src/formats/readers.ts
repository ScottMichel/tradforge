import type { SourceFormat } from "../core/config.js";
import type { BinaryReader, Reader } from "../core/reader.js";
import { androidReader } from "./android/reader.js";
import { arbReader } from "./arb/reader.js";
import { docxReader } from "./docx/reader.js";
import { htmlReader } from "./html/reader.js";
import { iosStringsReader } from "./ios/reader.js";
import { jsonReader } from "./json/reader.js";
import { luaReader } from "./lua/reader.js";
import { markdownReader } from "./markdown/reader.js";
import { odtReader } from "./odt/reader.js";
import { paradoxReader } from "./paradox/reader.js";
import { poReader } from "./po/reader.js";
import { pptxReader } from "./pptx/reader.js";
import { propertiesReader } from "./properties/reader.js";
import { pzReader } from "./pz/reader.js";
import { renpyReader } from "./renpy/reader.js";
import { resxReader } from "./resx/reader.js";
import { rimworldReader } from "./rimworld/reader.js";
import { srtReader } from "./srt/reader.js";
import { vttReader } from "./vtt/reader.js";
import { xcstringsReader } from "./xcstrings/reader.js";
import { xliffReader } from "./xliff/reader.js";
import { xlsxReader } from "./xlsx/reader.js";
import { yamlReader } from "./yaml/reader.js";

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
