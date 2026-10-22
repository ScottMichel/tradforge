import type { BinaryWriter } from "../../core/writer.js";
import { partText, readPackage, withPart, writePackage } from "../office/package.js";
import { DRAWING, parseParagraphs, writeParagraph } from "../office/paragraphs.js";
import { slideParts } from "./reader.js";

/** lang="en-US" on run properties: the language PowerPoint checks a text in. */
const LANGUAGE = /(<a:(?:rPr|endParaRPr)\b[^>]*?\blang=")[^"]*(")/g;

/**
 * Writes each translated paragraph of the slides and speaker notes, its runs rebuilt in the order of the
 * translation and its language set for spelling. Layouts, masters, pictures and every other part stay byte for
 * byte. An untranslated paragraph stays as it is; asciiOnly has no effect (the parts are UTF-8).
 */
export const pptxWriter: BinaryWriter = {
  format: "pptx",
  binary: true,
  write({ file, bytes, translate, languages }) {
    const entries = readPackage(file, bytes);
    const changed = new Map<string, string>();
    let translated = 0;
    let untranslated = 0;
    for (const { entry } of slideParts(file, entries)) {
      const xml = partText(file, entry);
      let output = "";
      let copied = 0;
      for (const paragraph of withPart(file, entry.name, () => parseParagraphs(xml, DRAWING))) {
        const translation = translate(paragraph.value);
        if (translation === undefined) {
          untranslated++;
          continue;
        }
        translated++;
        const written = writeParagraph(paragraph, translation).replace(LANGUAGE, `$1${languages.target}$2`);
        output += xml.slice(copied, paragraph.start) + written;
        copied = paragraph.end;
      }
      if (copied > 0) changed.set(entry.name, output + xml.slice(copied));
    }
    return { bytes: writePackage(bytes, entries, changed), translated, untranslated };
  },
};
