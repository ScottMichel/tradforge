import { ReadError, type Reader, stripBom } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { type Cue, parseCues, type SubtitleDialect, SubtitleSyntaxError } from "./cues.js";

/**
 * Cues closer than this belong to the same scene. Lines of one exchange follow each other within a second or so
 * (subtitlers leave a gap of a few frames between cues); a silence of more than two seconds usually means a pause,
 * a cut or a new scene. Overlapping cues (two speakers at once) always share a scene.
 */
export const SCENE_GAP_MS = 2000;

const DIALECT_NAMES: Readonly<Record<SubtitleDialect, string>> = { srt: "SubRip", vtt: "WebVTT" };

/**
 * A reader for SRT or WebVTT: one occurrence per cue, its key the cue number or identifier (or its position),
 * and a group per scene so that the pipeline translates a conversation in one batch.
 */
export function subtitleReader(format: SubtitleDialect): Reader {
  return {
    format,
    read({ file, content, priority, context }) {
      const occurrences: Occurrence[] = [];
      let scene = "";
      let sceneEnd: number | undefined;
      for (const cue of parseSubtitles(file, stripBom(content), format)) {
        if (sceneEnd === undefined || cue.startMs - sceneEnd > SCENE_GAP_MS) scene = cueKey(cue);
        sceneEnd = Math.max(sceneEnd ?? cue.endMs, cue.endMs);
        if (!isSpeech(cue.text)) continue;
        occurrences.push({
          source: cue.text,
          location: { file, key: cueKey(cue), line: cue.line },
          priority,
          ...(context !== undefined ? { context } : {}),
          group: `${file}#${scene}`,
        });
      }
      return occurrences;
    },
  };
}

/** The cues of a file without byte order mark; syntax errors name the file. */
export function parseSubtitles(file: string, content: string, format: SubtitleDialect): Cue[] {
  try {
    return parseCues(content, format);
  } catch (error) {
    if (error instanceof SubtitleSyntaxError) {
      throw new ReadError(file, `invalid ${DIALECT_NAMES[format]} (${error.message})`, { cause: error });
    }
    throw error;
  }
}

/**
 * True if the cue has something to translate: a letter outside the tags (<i>, <v Bob>) and override codes ({\an8}).
 * Empty cues, music notes and dots are left as they are.
 */
export function isSpeech(text: string): boolean {
  return /\p{L}/u.test(text.replace(/<[^>]*>|\{[^}]*\}/g, ""));
}

function cueKey(cue: Cue): string {
  return cue.id ?? String(cue.index);
}
