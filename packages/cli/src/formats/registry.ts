import path from "node:path";
import { SOURCE_FORMATS, type SourceFormat, type TradforgeConfig } from "../core/config.js";
import type { BinaryReader, Reader } from "../core/reader.js";
import type { PlaceholderSyntax } from "../core/validation/placeholders.js";
import type { BinaryWriter, Writer } from "../core/writer.js";
import { androidFormat } from "./apps/android/format.js";
import { arbFormat } from "./apps/arb/format.js";
import { iosStringsFormat } from "./apps/ios-strings/format.js";
import { jsonFormat } from "./apps/json/format.js";
import { poFormat } from "./apps/po/format.js";
import { propertiesFormat } from "./apps/properties/format.js";
import { resxFormat } from "./apps/resx/format.js";
import { xcstringsFormat } from "./apps/xcstrings/format.js";
import { xliffFormat } from "./apps/xliff/format.js";
import { yamlFormat } from "./apps/yaml/format.js";
import { docxFormat } from "./documents/docx/format.js";
import { htmlFormat } from "./documents/html/format.js";
import { markdownFormat } from "./documents/markdown/format.js";
import { odtFormat } from "./documents/odt/format.js";
import { pptxFormat } from "./documents/pptx/format.js";
import { xlsxFormat } from "./documents/xlsx/format.js";
import type { FormatDescriptor } from "./format.js";
import { luaFormat } from "./games/lua/format.js";
import { paradoxFormat } from "./games/paradox-yml/format.js";
import { renpyFormat } from "./games/renpy/format.js";
import { rimworldFormat } from "./games/rimworld-xml/format.js";
import { zomboidFormat } from "./games/zomboid-txt/format.js";
import { srtFormat } from "./subtitles/srt/format.js";
import { vttFormat } from "./subtitles/vtt/format.js";

/** Every format, by id. `satisfies` makes a format missing from the registry a compile error. */
export const FORMATS = {
  android: androidFormat,
  arb: arbFormat,
  docx: docxFormat,
  html: htmlFormat,
  "ios-strings": iosStringsFormat,
  json: jsonFormat,
  lua: luaFormat,
  markdown: markdownFormat,
  odt: odtFormat,
  "paradox-yml": paradoxFormat,
  po: poFormat,
  pptx: pptxFormat,
  properties: propertiesFormat,
  renpy: renpyFormat,
  resx: resxFormat,
  "rimworld-xml": rimworldFormat,
  srt: srtFormat,
  vtt: vttFormat,
  xcstrings: xcstringsFormat,
  xliff: xliffFormat,
  xlsx: xlsxFormat,
  yaml: yamlFormat,
  "zomboid-txt": zomboidFormat,
} as const satisfies Record<SourceFormat, FormatDescriptor>;

export function formatFor(format: SourceFormat): FormatDescriptor {
  return FORMATS[format];
}

/** The reader of a format, text or binary: callers tell them apart with isBinary. */
export function readerFor(format: SourceFormat): Reader | BinaryReader {
  return FORMATS[format].reader;
}

/** The writer of a format, text or binary: callers tell them apart with isBinary. */
export function writerFor(format: SourceFormat): Writer | BinaryWriter {
  return FORMATS[format].writer;
}

/** The format of a file, from its extension. Formats with a generic extension are found by their path instead. */
export function formatOf(file: string): SourceFormat | undefined {
  const extension = path.posix.extname(file).toLowerCase();
  return SOURCE_FORMATS.find((format) => FORMATS[format].extensions.includes(extension));
}

/**
 * The placeholder syntaxes to check: the configured ones, plus those of the formats the project uses (the Paradox
 * syntax comes with Paradox files, never elsewhere).
 */
export function effectivePlaceholders(config: Pick<TradforgeConfig, "sources" | "validation">): PlaceholderSyntax[] {
  const syntaxes = new Set(config.validation.placeholders);
  for (const source of config.sources) {
    for (const syntax of FORMATS[source.format].placeholders ?? []) syntaxes.add(syntax);
  }
  return [...syntaxes];
}

/**
 * The configuration of a project as the pipeline uses it: the placeholder syntaxes of its formats added to the
 * validation. Every program that opens a project (the command line, the desktop application) goes through it.
 */
export function withFormatPlaceholders(config: TradforgeConfig): TradforgeConfig {
  return { ...config, validation: { ...config.validation, placeholders: effectivePlaceholders(config) } };
}
