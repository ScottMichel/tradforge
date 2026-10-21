import { readFile } from "node:fs/promises";
import path from "node:path";
import { SOURCE_FORMATS, type SourceFormat } from "../core/config.js";
import type { TextEncoding } from "../core/encodings.js";
import { languageName } from "../core/languages.js";
import { androidLanguage } from "./android/resources.js";
import { findFiles } from "./files.js";
import { paradoxLanguage } from "./paradox/languages.js";
import { pzLanguageCode } from "./pz/languages.js";

/** The file extensions of each format, in lower case. Formats with a generic extension are found by their path. */
export const FORMAT_EXTENSIONS: Readonly<Record<SourceFormat, readonly string[]>> = {
  android: [], // .xml is too generic: Android resources are recognised by their path (res/values/strings.xml)
  "ios-strings": [".strings"],
  json: [".json"],
  lua: [".lua"],
  srt: [".srt"],
  vtt: [".vtt"],
  renpy: [".rpy"],
  po: [".po", ".pot"],
  xliff: [".xlf", ".xliff"],
  yaml: [".yml", ".yaml"], // Paradox .yml files are recognised by their path first
  "paradox-yml": [], // .yml is too generic: Paradox files are recognised by their name (ui_l_english.yml)
  "zomboid-txt": [], // .txt is too generic: Project Zomboid tables are recognised by their path (Translate/EN/UI_EN.txt)
  "rimworld-xml": [], // .xml is too generic: RimWorld files are recognised by their path (Languages/English/Keyed/)
};

/** A source that detectSources suggests for the configuration. */
export interface DetectedSource {
  readonly format: SourceFormat;
  readonly include: readonly string[];
  /** Output path template. */
  readonly output: string;
  /** Output encoding the format requires, if any (Paradox games need utf-8-bom). */
  readonly encoding?: TextEncoding;
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

/** JSON files that configure tools (or describe a language) rather than hold texts. */
const TOOL_CONFIGURATION =
  /^(package|package-lock|composer|biome|jsconfig.*|tsconfig.*|tradforge\.config|language|.*\.schema)\.json$/i;

/** The format of a file, from its extension. */
export function formatOf(file: string): SourceFormat | undefined {
  const extension = path.posix.extname(file).toLowerCase();
  return SOURCE_FORMATS.find((format) => FORMAT_EXTENSIONS[format].includes(extension));
}

interface Suggestion {
  readonly format: SourceFormat;
  readonly include: string;
  readonly output: string;
  readonly encoding?: TextEncoding;
}

/**
 * Looks at every file of a folder and suggests sources for the configuration.
 * JSON files are only kept with a language marker in their path (locales/en/ui.json, ui.en.json): a project holds
 * many JSON files that are not texts. Lua files are all kept: the Lua reader only extracts texts meant for people.
 * Project Zomboid translations (Translate/EN/) get the folder codes of the game when the target language is known.
 */
export async function detectSources(root: string, sourceLanguage: string, targetLanguage?: string): Promise<Detection> {
  const markers = languageMarkers(sourceLanguage);
  const found = new Map<string, Suggestion & { files: number }>();
  /** Script formats: every file is kept (their readers only extract texts meant for people), by folder. */
  const scripts = new Map<"lua" | "renpy", { folders: Set<string>; files: number }>();
  const skipped: SkippedFile[] = [];
  const add = (suggestion: Suggestion) => {
    const existing = found.get(suggestion.include);
    found.set(suggestion.include, { ...suggestion, files: (existing?.files ?? 0) + 1 });
  };

  for (const file of await findFiles(root, ["**/*"], { exclude: [".tradforge"] })) {
    const byPath =
      pzSuggestion(file, sourceLanguage, targetLanguage) ?? paradoxSuggestion(file, sourceLanguage, targetLanguage);
    if (byPath !== undefined) {
      add(byPath);
      continue;
    }
    const rimworld = await rimworldSuggestion(root, file, sourceLanguage, targetLanguage);
    if (rimworld !== undefined) {
      if ("reason" in rimworld) skipped.push({ file, reason: rimworld.reason });
      else add(rimworld);
      continue;
    }
    const android = await androidSuggestion(root, file, sourceLanguage, targetLanguage);
    if (android !== undefined) {
      if ("reason" in android) skipped.push({ file, reason: android.reason });
      else add(android);
      continue;
    }
    const format = formatOf(file);
    if (format === "srt" || format === "vtt") {
      const subtitles = subtitleSuggestion(file, format, sourceLanguage);
      if ("reason" in subtitles) skipped.push({ file, reason: subtitles.reason });
      else add(subtitles);
      continue;
    }
    if (format === "lua" || format === "renpy") {
      // Ren'Py: game/tl/ holds existing translations, renpy/ the engine shipped with some games.
      if (format === "renpy" && /(^|\/)(game\/tl|renpy)\//.test(file)) continue;
      const entry = scripts.get(format) ?? { folders: new Set<string>(), files: 0 };
      entry.folders.add(path.posix.dirname(file));
      entry.files++;
      scripts.set(format, entry);
      continue;
    }
    if (format === "po") {
      const catalog = poSuggestion(file, markers, sourceLanguage);
      if ("reason" in catalog) skipped.push({ file, reason: catalog.reason });
      else add(catalog);
      continue;
    }
    if (format === "xliff") {
      const exchange = await xliffSuggestion(root, file, markers, sourceLanguage);
      if ("reason" in exchange) skipped.push({ file, reason: exchange.reason });
      else add(exchange);
      continue;
    }
    if (format === "ios-strings") {
      const strings = iosSuggestion(file, markers, targetLanguage);
      if ("reason" in strings) skipped.push({ file, reason: strings.reason });
      else add(strings);
      continue;
    }
    if (format === "yaml") {
      const suggestion = markedSuggestion("yaml", file, markers, undefined);
      if (suggestion === undefined)
        skipped.push({ file, reason: "no language marker in its path (like locales/en.yml)" });
      else add(suggestion);
      continue;
    }
    if (format !== "json") continue;

    if (TOOL_CONFIGURATION.test(path.posix.basename(file))) {
      skipped.push({ file, reason: "configuration file of a tool" });
      continue;
    }
    const suggestion = markedSuggestion("json", file, markers, targetLanguage);
    if (suggestion === undefined) {
      skipped.push({ file, reason: "no language marker in its path (like locales/en/ or ui.en.json)" });
      continue;
    }
    add(suggestion);
  }

  const sources: DetectedSource[] = [...found.values()]
    .sort((a, b) => (a.include < b.include ? -1 : a.include > b.include ? 1 : 0))
    .map(({ format, include, output, encoding, files }) => ({
      format,
      include: [include],
      output,
      ...(encoding !== undefined ? { encoding } : {}),
      files,
    }));
  for (const format of ["lua", "renpy"] as const) {
    const entry = scripts.get(format);
    if (entry === undefined) continue;
    const extension = format === "lua" ? "lua" : "rpy";
    sources.push({
      format,
      include: [...entry.folders]
        .sort()
        .map((folder) => (folder === "." ? `*.${extension}` : `${folder}/*.${extension}`)),
      // A separate folder: a game must not load the original and the translated script side by side.
      output: "translations/{lang}/{dir}/{name}{ext}",
      files: entry.files,
    });
  }
  return { sources, skipped };
}

/** "en" → ["en", "english"]: folders are named after the code or the English name of the language. */
function languageMarkers(language: string): string[] {
  return [...new Set([language.toLowerCase(), languageName(language).toLowerCase()])];
}

/** A Project Zomboid Build 41 table: <...>/Translate/EN/UI_EN.txt. */
function pzSuggestion(
  file: string,
  sourceLanguage: string,
  targetLanguage: string | undefined,
): Suggestion | undefined {
  const code = pzLanguageCode(sourceLanguage);
  const folder = path.posix.dirname(file);
  const parts = folder.split("/");
  const isTable =
    parts.at(-2)?.toLowerCase() === "translate" &&
    parts.at(-1)?.toUpperCase() === code &&
    file.toUpperCase().endsWith(`_${code}.TXT`);
  if (!isTable) return undefined;
  const target = targetLanguage === undefined ? "{LANG}" : pzLanguageCode(targetLanguage);
  const output = [...parts.slice(0, -1), target].join("/");
  return {
    format: "zomboid-txt",
    include: `${folder}/*_${parts.at(-1)}.txt`,
    output: `${output}/{stem}_${target}{ext}`,
  };
}

/**
 * Subtitles in the source language (movie.en.srt: a pattern for the folder) or without a language (movie.srt: the
 * file itself, so that other languages in the folder are not taken). Subtitles in another language are left out.
 * Translations go next to them, as players expect: movie.fr.srt.
 */
function subtitleSuggestion(
  file: string,
  format: "srt" | "vtt",
  sourceLanguage: string,
): Suggestion | { reason: string } {
  const extension = path.posix.extname(file);
  const folder = path.posix.dirname(file);
  const marker = /[._-]([A-Za-z]{2,3}(?:-[A-Za-z]{2})?)$/.exec(path.posix.basename(file, extension))?.[1];
  const output = "{dir}/{stem}.{lang}{ext}";
  if (marker !== undefined && marker.toLowerCase() === sourceLanguage.toLowerCase()) {
    const prefix = folder === "." ? "" : `${folder}/`;
    return { format, include: `${prefix}*.${marker}${extension}`, output };
  }
  if (marker !== undefined && languageName(marker) !== marker) {
    return { reason: `subtitles in another language (${languageName(marker)})` };
  }
  return { format, include: file, output };
}

/**
 * A Paradox localisation file: <...>/english/name_l_english.yml. The game's language names are used ("braz_por"),
 * and the files must start with a byte order mark.
 */
function paradoxSuggestion(
  file: string,
  sourceLanguage: string,
  targetLanguage: string | undefined,
): Suggestion | undefined {
  const source = paradoxLanguage(sourceLanguage);
  if (!file.toLowerCase().endsWith(`_l_${source}.yml`)) return undefined;
  const target = targetLanguage === undefined ? "{language}" : paradoxLanguage(targetLanguage);
  const folder = path.posix.dirname(file);
  const output = folder
    .split("/")
    .map((part) => (part.toLowerCase() === source ? target : part))
    .join("/");
  return {
    format: "paradox-yml",
    include: `${folder}/*_l_${source}.yml`,
    output: `${output}/{stem}_l_${target}{ext}`,
    encoding: "utf-8-bom",
  };
}

/**
 * A RimWorld language file: <...>/Languages/English/Keyed/*.xml or .../DefInjected/<DefType>/*.xml, whose root is
 * LanguageData (LanguageInfo.xml and other XML files of the folder are left out).
 */
async function rimworldSuggestion(
  root: string,
  file: string,
  sourceLanguage: string,
  targetLanguage: string | undefined,
): Promise<Suggestion | { reason: string } | undefined> {
  if (!file.toLowerCase().endsWith(".xml")) return undefined;
  const parts = path.posix.dirname(file).split("/");
  const english = languageName(sourceLanguage).toLowerCase();
  const index = parts.findIndex(
    (part, i) =>
      part.toLowerCase() === "languages" &&
      (parts[i + 1]?.toLowerCase().startsWith(english) ?? false) &&
      ["keyed", "definjected"].includes(parts[i + 2]?.toLowerCase() ?? ""),
  );
  const isLanguageInfo =
    parts.at(-2)?.toLowerCase() === "languages" && parts.at(-1)?.toLowerCase().startsWith(english) === true;
  if (index === -1 && !isLanguageInfo) return undefined;

  const head = (await readFile(path.join(root, file))).subarray(0, 1024).toString("utf8");
  if (index === -1 || !/<LanguageData[\s>/]/.test(head)) {
    return { reason: "not a RimWorld language file (its root is not LanguageData)" };
  }
  const target = targetLanguage === undefined ? "{language}" : languageName(targetLanguage);
  const folder = parts.join("/");
  const output = parts.map((part, i) => (i === index + 1 ? target : part)).join("/");
  return { format: "rimworld-xml", include: `${folder}/*.xml`, output: `${output}/{name}{ext}` };
}

/**
 * A gettext catalog. A template (.pot) is always in the source language: the translations go next to it in a po/
 * folder (po/fr.po, as GNU projects do), or where gettext looks for them at run time (locale/fr/LC_MESSAGES/x.po).
 * A .po needs a marker of the source language in its path (locale/en/LC_MESSAGES/x.po, po/en.po): the others are
 * the translations of other languages.
 */
function poSuggestion(
  file: string,
  markers: readonly string[],
  sourceLanguage: string,
): Suggestion | { reason: string } {
  const folder = path.posix.dirname(file);
  const prefix = folder === "." ? "" : `${folder}/`;
  if (path.posix.extname(file).toLowerCase() === ".pot") {
    const gnu = path.posix.basename(folder).toLowerCase() === "po";
    return {
      format: "po",
      include: file,
      output: gnu ? `${prefix}{lang}.po` : `${prefix}{lang}/LC_MESSAGES/{name}.po`,
    };
  }
  const marked = markedSuggestion("po", file, markers, undefined);
  if (marked !== undefined) return marked;
  return { reason: `no marker of ${languageName(sourceLanguage)} in its path (like locale/en/LC_MESSAGES/ or en.po)` };
}

/**
 * An XLIFF file in the source language that holds no translation yet. The translation goes next to it, as Angular
 * names it (messages.xlf → messages.fr.xlf), unless the path has a marker of the language to replace. A file that
 * already names a target language is the translation of another language.
 */
async function xliffSuggestion(
  root: string,
  file: string,
  markers: readonly string[],
  sourceLanguage: string,
): Promise<Suggestion | { reason: string }> {
  const head = (await readFile(path.join(root, file))).subarray(0, 4096).toString("utf8");
  if (!/<(?:[\w-]+:)?xliff[\s>]/.test(head)) return { reason: "not an XLIFF document" };
  const language = (pattern: RegExp) => pattern.exec(head)?.[1];
  const source = language(/\s(?:source-language|srcLang)\s*=\s*["']([^"']+)/);
  if (source !== undefined && baseLanguage(source) !== baseLanguage(sourceLanguage)) {
    return { reason: `its source language is ${languageName(source)}` };
  }
  const target = language(/\s(?:target-language|trgLang)\s*=\s*["']([^"']+)/);
  if (target !== undefined) return { reason: `already a translation into ${languageName(target)}` };
  const marked = markedSuggestion("xliff", file, markers, undefined);
  if (marked !== undefined) return marked;
  const extension = path.posix.extname(file);
  const name = path.posix.basename(file, extension);
  const folder = path.posix.dirname(file);
  const prefix = folder === "." ? "" : `${folder}/`;
  return { format: "xliff", include: file, output: `${prefix}${name}.{lang}${extension}` };
}

function baseLanguage(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Android string resources: <...>/res/values/strings.xml (or values-en/), whose root is <resources> and which hold
 * texts. One source per file: other files of the folder (colors, dimensions) must not be copied into values-fr/.
 */
async function androidSuggestion(
  root: string,
  file: string,
  sourceLanguage: string,
  targetLanguage: string | undefined,
): Promise<Suggestion | { reason: string } | undefined> {
  const parts = path.posix.dirname(file).split("/");
  const folder = parts.at(-1) ?? "";
  if (!file.toLowerCase().endsWith(".xml") || parts.at(-2) !== "res" || !folder.startsWith("values")) return undefined;
  const content = (await readFile(path.join(root, file))).toString("utf8");
  if (!/<resources[\s>]/.test(content) || !/<(?:string|string-array|plurals)[\s>]/.test(content)) return undefined;
  const source = androidLanguage(sourceLanguage);
  if (folder !== "values" && folder !== `values-${source}` && folder !== `values-${baseLanguage(sourceLanguage)}`) {
    return { reason: "Android strings of another language or configuration" };
  }
  const target = targetLanguage === undefined ? "{lang}" : androidLanguage(targetLanguage);
  const output = [...parts.slice(0, -1), `values-${target}`].join("/");
  return { format: "android", include: file, output: `${output}/{name}{ext}` };
}

/**
 * Apple .strings files sit in a folder per language: en.lproj/Localizable.strings (or Base.lproj, or the old
 * English.lproj). The translations go to fr.lproj/.
 */
function iosSuggestion(
  file: string,
  markers: readonly string[],
  targetLanguage: string | undefined,
): Suggestion | { reason: string } {
  const folder = path.posix.dirname(file);
  const parts = folder.split("/");
  const language = /^(.+)\.lproj$/i.exec(parts.at(-1) ?? "")?.[1];
  if (language === undefined) return { reason: "not in a <language>.lproj folder" };
  if (language.toLowerCase() !== "base" && !isMarker(language, markers)) {
    return { reason: "strings of another language" };
  }
  const output = [...parts.slice(0, -1), `${targetLanguage ?? "{lang}"}.lproj`].join("/");
  return { format: "ios-strings", include: `${folder}/*.strings`, output: `${output}/{name}{ext}` };
}

/** The include pattern and output template for a file with a language marker in its path, if it has one. */
function markedSuggestion(
  format: "json" | "po" | "xliff" | "yaml",
  file: string,
  markers: readonly string[],
  targetLanguage: string | undefined,
): Suggestion | undefined {
  const folder = path.posix.dirname(file);
  const folders = folder.split("/");
  const index = folders.findIndex((part) => isMarker(part, markers));
  if (index !== -1) {
    const marker = folders[index] ?? "";
    const inGame = folders[index - 1]?.toLowerCase() === "translate" && targetLanguage !== undefined;
    const replacement = inGame ? pzLanguageCode(targetLanguage) : placeholderLike(marker, markers);
    const output = folders.map((part, i) => (i === index ? replacement : part)).join("/");
    return { format, include: `${folder}/*${path.posix.extname(file)}`, output: `${output}/{name}{ext}` };
  }

  const extension = path.posix.extname(file);
  const name = path.posix.basename(file, extension);
  for (const marker of markers) {
    const inName = new RegExp(`(^|[._-])${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[._-]|$)`, "i");
    if (inName.test(name)) {
      const prefix = folder === "." ? "" : `${folder}/`;
      return { format, include: file, output: `${prefix}${name.replace(inName, "$1{lang}")}${extension}` };
    }
  }
  return undefined;
}

/** The output placeholder that writes the target language the way the source folder writes the source one. */
function placeholderLike(marker: string, markers: readonly string[]): string {
  if (marker.length > 3 && markers.includes(marker.toLowerCase())) return "{language}"; // english → french
  return marker === marker.toUpperCase() ? "{LANG}" : "{lang}"; // EN → FR, en → fr
}

/** "en", "EN", "en-US", "en_us" and "English" are all markers of English. */
function isMarker(part: string, markers: readonly string[]): boolean {
  const lower = part.toLowerCase();
  return markers.some((marker) => lower === marker || lower.startsWith(`${marker}-`) || lower.startsWith(`${marker}_`));
}
