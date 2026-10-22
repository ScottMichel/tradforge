import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SourceFormat } from "../../core/config.js";
import type { TextEncoding } from "../../core/encodings.js";
import { languageName } from "../../core/languages.js";

/**
 * What the formats share to recognise their files for tradforge init: the context of one file, what a detection
 * answers, and the helpers most formats use (language markers in a path, the output next to the source).
 */

/** A source that a format suggests for the configuration. */
export interface Suggestion {
  readonly format: SourceFormat;
  /** The include pattern, or the file itself. */
  readonly include: string;
  /** Output path template. */
  readonly output: string;
  /** Output encoding the format requires, if any (Paradox games need utf-8-bom). */
  readonly encoding?: TextEncoding;
  /**
   * Script formats (Lua, Ren'Py): every file of the format becomes part of one source, as one pattern per folder,
   * since their readers only take texts meant for people.
   */
  readonly byFolder?: true;
}

/** A suggestion, a reason to leave the file out, or undefined: the file is not of this format. */
export type DetectionResult = Suggestion | { readonly reason: string } | undefined;

export interface DetectionContext {
  /** The project folder, to read the head of a file when its path is not enough. */
  readonly root: string;
  /** The file, relative to the project, with "/" separators. */
  readonly file: string;
  /** Every file of the project: a format may look at the files next to this one. */
  readonly files: readonly string[];
  readonly sourceLanguage: string;
  readonly targetLanguage?: string;
  /** The ways a path names the source language: "en", "english". */
  readonly markers: readonly string[];
}

/** "en" → ["en", "english"]: folders are named after the code or the English name of the language. */
export function languageMarkers(language: string): string[] {
  return [...new Set([language.toLowerCase(), languageName(language).toLowerCase()])];
}

/** "en", "EN", "en-US", "en_us" and "English" are all markers of English. */
export function isMarker(part: string, markers: readonly string[]): boolean {
  const lower = part.toLowerCase();
  return markers.some((marker) => lower === marker || lower.startsWith(`${marker}-`) || lower.startsWith(`${marker}_`));
}

/** "pt-BR" → "pt": two codes of the same language compare equal. */
export function baseLanguage(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0] ?? "";
}

/** "docs" → "docs/", "." → "": what to put before a file name of the same folder. */
export function folderPrefix(file: string): string {
  const folder = path.posix.dirname(file);
  return folder === "." ? "" : `${folder}/`;
}

/** The first bytes of a file, as text: enough to see its root element or the language it declares. */
export async function readHead(context: DetectionContext, bytes: number): Promise<string> {
  return (await readFile(path.join(context.root, context.file))).subarray(0, bytes).toString("utf8");
}

/** Whether a file name ends with the code of a language: "README.fr", "manual_de". */
export function nameInAnotherLanguage(name: string): boolean {
  const suffix = /[._-]([A-Za-z]{2,3}(?:[-_][A-Za-z]{2,4})?)$/.exec(name)?.[1];
  if (suffix === undefined) return false;
  const code = suffix.replace("_", "-");
  return languageName(code) !== code;
}

/** The output placeholder that writes the target language the way the source folder writes the source one. */
function placeholderLike(marker: string, markers: readonly string[]): string {
  if (marker.length > 3 && markers.includes(marker.toLowerCase())) return "{language}"; // english → french
  return marker === marker.toUpperCase() ? "{LANG}" : "{lang}"; // EN → FR, en → fr
}

/**
 * The source for a file with a marker of the source language in its path: in a folder (locales/en/ui.json → every
 * file of the folder, written to locales/fr/) or in its name (ui.en.json → ui.fr.json). Undefined without a marker.
 * A format may name the language of the output folder its own way (replace).
 */
export function markedSuggestion(
  format: SourceFormat,
  context: Pick<DetectionContext, "file" | "markers">,
  replace?: (marker: string, folders: readonly string[], index: number) => string | undefined,
): Suggestion | undefined {
  const { file, markers } = context;
  const folder = path.posix.dirname(file);
  const folders = folder.split("/");
  const index = folders.findIndex((part) => isMarker(part, markers));
  if (index !== -1) {
    const marker = folders[index] ?? "";
    const replacement = replace?.(marker, folders, index) ?? placeholderLike(marker, markers);
    const output = folders.map((part, i) => (i === index ? replacement : part)).join("/");
    return { format, include: `${folder}/*${path.posix.extname(file)}`, output: `${output}/{name}{ext}` };
  }

  const extension = path.posix.extname(file);
  const name = path.posix.basename(file, extension);
  for (const marker of markers) {
    const inName = new RegExp(`(^|[._-])${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[._-]|$)`, "i");
    if (inName.test(name)) {
      return { format, include: file, output: `${folderPrefix(file)}${name.replace(inName, "$1{lang}")}${extension}` };
    }
  }
  return undefined;
}

/**
 * A document translated next to itself (manual.docx → manual.fr.docx): with a marker of the source language, or
 * without any. Documents of another language and the lock files of an open document (~$manual.docx) are left out.
 */
export function documentSuggestion(format: SourceFormat, context: DetectionContext): DetectionResult {
  const extension = path.posix.extname(context.file);
  const name = path.posix.basename(context.file, extension);
  if (name.startsWith("~$")) return { reason: "a lock file of an open document" };
  const marked = markedSuggestion(format, context);
  if (marked !== undefined) return marked;
  if (nameInAnotherLanguage(name)) return { reason: "a document in another language" };
  return { format, include: context.file, output: `${folderPrefix(context.file)}${name}.{lang}${extension}` };
}
