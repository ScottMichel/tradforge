import path from "node:path";
import { SOURCE_FORMATS, type SourceFormat } from "../core/config.js";
import { languageName } from "../core/languages.js";
import { findFiles } from "./files.js";

/** The file extensions of each format, in lower case. */
export const FORMAT_EXTENSIONS: Readonly<Record<SourceFormat, readonly string[]>> = {
  json: [".json"],
  lua: [".lua"],
};

/** A source that detectSources suggests for the configuration. */
export interface DetectedSource {
  readonly format: SourceFormat;
  readonly include: readonly string[];
  /** Output path template. */
  readonly output: string;
  /** Number of files the source covers. */
  readonly files: number;
}

export interface SkippedFile {
  readonly file: string;
  readonly reason: string;
}

export interface Detection {
  readonly sources: readonly DetectedSource[];
  /** Files of a known format that were left out, and why: the user decides. */
  readonly skipped: readonly SkippedFile[];
}

/** JSON files that configure tools rather than hold texts. */
const TOOL_CONFIGURATION =
  /^(package|package-lock|composer|biome|jsconfig.*|tsconfig.*|tradforge\.config|.*\.schema)\.json$/i;

/** The format of a file, from its extension. */
export function formatOf(file: string): SourceFormat | undefined {
  const extension = path.posix.extname(file).toLowerCase();
  return SOURCE_FORMATS.find((format) => FORMAT_EXTENSIONS[format].includes(extension));
}

/**
 * Looks at every file of a folder and suggests sources for the configuration.
 * JSON files are only kept with a language marker in their path (locales/en/ui.json, ui.en.json): a project holds
 * many JSON files that are not texts. Lua files are all kept: the Lua reader only extracts texts meant for people.
 */
export async function detectSources(root: string, sourceLanguage: string): Promise<Detection> {
  const markers = languageMarkers(sourceLanguage);
  const json = new Map<string, { include: string; output: string; files: number }>();
  const luaFolders = new Set<string>();
  let luaFiles = 0;
  const skipped: SkippedFile[] = [];

  for (const file of await findFiles(root, ["**/*"], { exclude: [".tradforge"] })) {
    const format = formatOf(file);
    if (format === "lua") {
      luaFolders.add(path.posix.dirname(file));
      luaFiles++;
      continue;
    }
    if (format !== "json") continue;

    const name = path.posix.basename(file);
    if (TOOL_CONFIGURATION.test(name)) {
      skipped.push({ file, reason: "configuration file of a tool" });
      continue;
    }
    const suggestion = jsonSuggestion(file, markers);
    if (suggestion === undefined) {
      skipped.push({ file, reason: "no language marker in its path (like locales/en/ or ui.en.json)" });
      continue;
    }
    const existing = json.get(suggestion.include);
    json.set(suggestion.include, { ...suggestion, files: (existing?.files ?? 0) + 1 });
  }

  const sources: DetectedSource[] = [...json.values()]
    .sort((a, b) => (a.include < b.include ? -1 : a.include > b.include ? 1 : 0))
    .map(({ include, output, files }) => ({ format: "json", include: [include], output, files }));
  if (luaFiles > 0) {
    sources.push({
      format: "lua",
      include: [...luaFolders].sort().map((folder) => (folder === "." ? "*.lua" : `${folder}/*.lua`)),
      // A separate folder: a game must not load the original and the translated script side by side.
      output: "translations/{lang}/{dir}/{name}{ext}",
      files: luaFiles,
    });
  }
  return { sources, skipped };
}

/** "en" → ["en", "english"]: folders are named after the code or the English name of the language. */
function languageMarkers(language: string): string[] {
  return [...new Set([language.toLowerCase(), languageName(language).toLowerCase()])];
}

/** The include pattern and output template for a JSON file with a language marker, if it has one. */
function jsonSuggestion(file: string, markers: readonly string[]): { include: string; output: string } | undefined {
  const folder = path.posix.dirname(file);
  const folders = folder.split("/");
  const index = folders.findIndex((part) => isMarker(part, markers));
  if (index !== -1) {
    const output = folders.map((part, i) => (i === index ? "{lang}" : part)).join("/");
    return { include: `${folder}/*.json`, output: `${output}/{name}{ext}` };
  }

  const extension = path.posix.extname(file);
  const name = path.posix.basename(file, extension);
  for (const marker of markers) {
    const inName = new RegExp(`(^|[._-])${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[._-]|$)`, "i");
    if (inName.test(name)) {
      const prefix = folder === "." ? "" : `${folder}/`;
      return { include: file, output: `${prefix}${name.replace(inName, "$1{lang}")}${extension}` };
    }
  }
  return undefined;
}

/** "en", "EN", "en-US", "en_us" and "English" are all markers of English. */
function isMarker(part: string, markers: readonly string[]): boolean {
  const lower = part.toLowerCase();
  return markers.some((marker) => lower === marker || lower.startsWith(`${marker}-`) || lower.startsWith(`${marker}_`));
}
