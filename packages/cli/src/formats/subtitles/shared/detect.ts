import path from "node:path";
import { languageName } from "../../../core/languages.js";
import { type DetectionContext, type DetectionResult, folderPrefix } from "../../project/detection.js";

/**
 * Subtitles in the source language (movie.en.srt: a pattern for the folder) or without a language (movie.srt: the
 * file itself, so that other languages in the folder are not taken). Subtitles in another language are left out.
 * Translations go next to them, as players expect: movie.fr.srt.
 */
export function detectSubtitles(format: "srt" | "vtt", { file, sourceLanguage }: DetectionContext): DetectionResult {
  const extension = path.posix.extname(file);
  const marker = /[._-]([A-Za-z]{2,3}(?:-[A-Za-z]{2})?)$/.exec(path.posix.basename(file, extension))?.[1];
  const output = "{dir}/{stem}.{lang}{ext}";
  if (marker !== undefined && marker.toLowerCase() === sourceLanguage.toLowerCase()) {
    return { format, include: `${folderPrefix(file)}*.${marker}${extension}`, output };
  }
  if (marker !== undefined && languageName(marker) !== marker) {
    return { reason: `subtitles in another language (${languageName(marker)})` };
  }
  return { format, include: file, output };
}
