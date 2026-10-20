import type { Writer } from "../../core/writer.js";
import { pzLanguageCode } from "./languages.js";
import { parsePzTranslation } from "./translation.js";

/**
 * Writes a Build 41 translation table: texts replaced between their quotes, the table renamed (UI_EN → UI_FR),
 * everything else kept as it was. A text continued over several lines is written back on one line.
 * The file has no escape syntax: "asciiOnly" does not apply, choose the output encoding instead.
 */
export const pzWriter: Writer = {
  format: "zomboid-txt",
  write({ content, translate, languages }) {
    const { lines, endings, entries, header } = parsePzTranslation(content);
    const byStart = new Map(entries.map((entry) => [entry.start, entry]));
    let output = "";
    let translated = 0;
    let untranslated = 0;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      const entry = byStart.get(index);
      const translation = entry === undefined ? undefined : translate(entry.value);
      if (entry !== undefined) {
        if (translation === undefined) untranslated++;
        else translated++;
      }
      if (entry === undefined || translation === undefined) {
        const renamed = index === header ? renameTable(line, languages.source, languages.target) : line;
        output += renamed + (endings[index] ?? "");
        continue;
      }
      output += `${line.slice(0, entry.firstQuote + 1)}${translation}"${entry.suffix}${endings[entry.end] ?? ""}`;
      index = entry.end;
    }
    return { content: output, translated, untranslated };
  },
};

/** "UI_EN = {" → "UI_FR = {": the table carries the language code of the game. */
function renameTable(line: string, source: string, target: string): string {
  const from = pzLanguageCode(source);
  return line.replace(new RegExp(`_${from}(?=\\s*=?\\s*\\{)`, "i"), `_${pzLanguageCode(target)}`);
}
