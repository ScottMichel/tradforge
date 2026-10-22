import path from "node:path";
import { SOURCE_FORMATS, type SourceFormat } from "../../core/config.js";
import type { TextEncoding } from "../../core/encodings.js";
import { FORMATS } from "../registry.js";
import { type DetectionContext, languageMarkers, type Suggestion } from "./detection.js";
import { findFiles } from "./files.js";

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

/** Formats recognised by their path (generic extensions such as .xml or .txt): asked first, about every file. */
const BY_PATH = SOURCE_FORMATS.filter((format) => FORMATS[format].extensions.length === 0);

/**
 * Looks at every file of a folder and suggests sources for the configuration. Each format recognises its own files
 * (see the detect of its descriptor): first the formats found by their path, then the format of the file's extension.
 * A format may also leave a file out with a reason, shown to the user, who decides.
 */
export async function detectSources(root: string, sourceLanguage: string, targetLanguage?: string): Promise<Detection> {
  const markers = languageMarkers(sourceLanguage);
  const found = new Map<string, Suggestion & { files: number }>();
  /** Script formats: one source per format, with one pattern per folder. */
  const byFolder = new Map<SourceFormat, { folders: Set<string>; output: string; extension: string; files: number }>();
  const skipped: SkippedFile[] = [];

  const files = await findFiles(root, ["**/*"], { exclude: [".tradforge"] });
  for (const file of files) {
    const context: DetectionContext = {
      root,
      file,
      files,
      sourceLanguage,
      ...(targetLanguage !== undefined ? { targetLanguage } : {}),
      markers,
    };
    const extension = path.posix.extname(file).toLowerCase();
    const candidates = [
      ...BY_PATH,
      ...SOURCE_FORMATS.filter((format) => FORMATS[format].extensions.includes(extension)),
    ];
    for (const format of candidates) {
      const result = await FORMATS[format].detect(context);
      if (result === undefined) continue;
      if ("reason" in result) skipped.push({ file, reason: result.reason });
      else if (result.byFolder === true) {
        const entry = byFolder.get(result.format) ?? {
          folders: new Set<string>(),
          output: result.output,
          extension,
          files: 0,
        };
        entry.folders.add(path.posix.dirname(file));
        entry.files++;
        byFolder.set(result.format, entry);
      } else {
        const existing = found.get(result.include);
        found.set(result.include, { ...result, files: (existing?.files ?? 0) + 1 });
      }
      break;
    }
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
  for (const format of SOURCE_FORMATS) {
    const entry = byFolder.get(format);
    if (entry === undefined) continue;
    sources.push({
      format,
      include: [...entry.folders]
        .sort()
        .map((folder) => (folder === "." ? `*${entry.extension}` : `${folder}/*${entry.extension}`)),
      output: entry.output,
      files: entry.files,
    });
  }
  return { sources, skipped };
}
