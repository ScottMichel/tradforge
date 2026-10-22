import type { Writer } from "../../../core/writer.js";
import type { SubtitleDialect } from "./cues.js";
import { isSpeech, parseSubtitles } from "./reader.js";

const BOM = "\u{feff}";

/**
 * A writer for SRT or WebVTT: replaces the text of each translated cue in place. Cue numbers, timings, settings,
 * NOTE, STYLE and REGION blocks and the spacing stay byte for byte, with the line endings of the file.
 * Untranslated cues always keep their source text (a missing cue would shift the dialogue), whatever the options.
 * Subtitle files have no escapes, so asciiOnly does not apply.
 */
export function subtitleWriter(format: SubtitleDialect): Writer {
  return {
    format,
    write({ file, content, translate }) {
      const hasBom = content.startsWith(BOM);
      const text = hasBom ? content.slice(1) : content; // offsets are relative to the text without BOM
      const eol = /\r\n|\r|\n/.exec(text)?.[0] ?? "\n";
      let output = "";
      let copied = 0;
      let translated = 0;
      let untranslated = 0;

      for (const cue of parseSubtitles(file, text, format)) {
        if (!isSpeech(cue.text)) continue; // same filter as the reader
        const lines = cueLines(translate(cue.text), format);
        if (lines.length === 0) {
          untranslated++;
          continue;
        }
        translated++;
        output += text.slice(copied, cue.textStart) + lines.join(eol);
        copied = cue.textEnd;
      }
      output += text.slice(copied);
      return { content: (hasBom ? BOM : "") + output, translated, untranslated };
    },
  };
}

/**
 * The lines to write for a translation (none if there is no usable translation).
 * A blank line would end the cue, so blank lines are dropped; in WebVTT, "-->" would turn a line into a timing line.
 */
function cueLines(translation: string | undefined, format: SubtitleDialect): string[] {
  if (translation === undefined) return [];
  return translation
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .map((line) => (format === "vtt" ? line.replaceAll("-->", "--&gt;") : line));
}
