import type { SourceFormat } from "../core/config.js";
import type { BinaryWriter, Writer } from "../core/writer.js";
import { androidWriter } from "./apps/android/writer.js";
import { arbWriter } from "./apps/arb/writer.js";
import { iosStringsWriter } from "./apps/ios-strings/writer.js";
import { jsonWriter } from "./apps/json/writer.js";
import { poWriter } from "./apps/po/writer.js";
import { propertiesWriter } from "./apps/properties/writer.js";
import { resxWriter } from "./apps/resx/writer.js";
import { xcstringsWriter } from "./apps/xcstrings/writer.js";
import { xliffWriter } from "./apps/xliff/writer.js";
import { yamlWriter } from "./apps/yaml/writer.js";
import { docxWriter } from "./documents/docx/writer.js";
import { htmlWriter } from "./documents/html/writer.js";
import { markdownWriter } from "./documents/markdown/writer.js";
import { odtWriter } from "./documents/odt/writer.js";
import { pptxWriter } from "./documents/pptx/writer.js";
import { xlsxWriter } from "./documents/xlsx/writer.js";
import { luaWriter } from "./games/lua/writer.js";
import { paradoxWriter } from "./games/paradox-yml/writer.js";
import { renpyWriter } from "./games/renpy/writer.js";
import { rimworldWriter } from "./games/rimworld-xml/writer.js";
import { pzWriter } from "./games/zomboid-txt/writer.js";
import { srtWriter } from "./subtitles/srt/writer.js";
import { vttWriter } from "./subtitles/vtt/writer.js";

/** One writer per format. `satisfies` makes a missing format a compile error. */
export const WRITERS = {
  android: androidWriter,
  arb: arbWriter,
  docx: docxWriter,
  html: htmlWriter,
  "ios-strings": iosStringsWriter,
  json: jsonWriter,
  lua: luaWriter,
  markdown: markdownWriter,
  odt: odtWriter,
  "paradox-yml": paradoxWriter,
  po: poWriter,
  pptx: pptxWriter,
  properties: propertiesWriter,
  "zomboid-txt": pzWriter,
  renpy: renpyWriter,
  resx: resxWriter,
  "rimworld-xml": rimworldWriter,
  srt: srtWriter,
  vtt: vttWriter,
  xcstrings: xcstringsWriter,
  xliff: xliffWriter,
  xlsx: xlsxWriter,
  yaml: yamlWriter,
} as const satisfies Record<SourceFormat, Writer | BinaryWriter>;

/** The writer of a format, text or binary: callers tell them apart with isBinary. */
export function writerFor(format: SourceFormat): Writer | BinaryWriter {
  return WRITERS[format];
}
