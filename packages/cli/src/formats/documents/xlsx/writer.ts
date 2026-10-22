import type { BinaryWriter } from "../../../core/writer.js";
import { partText, readPackage, withPart, writePackage } from "../../shared/office/package.js";
import { parseParagraphs, writeParagraph } from "../../shared/office/paragraphs.js";
import { workbookParts } from "./reader.js";

/** lang="en-US" on the run properties of a drawing: the language Excel checks a text box in. */
const LANGUAGE = /(<a:(?:rPr|endParaRPr)\b[^>]*?\blang=")[^"]*(")/g;

/**
 * Translates the strings of a workbook in place: the shared strings keep their order and their count, so that every
 * cell still points to its own. Sheet names, formulas, numbers and every other part stay byte for byte. An
 * untranslated string stays as it is; asciiOnly has no effect (the parts are UTF-8).
 */
export const xlsxWriter: BinaryWriter = {
  format: "xlsx",
  binary: true,
  write({ file, bytes, translate, languages }) {
    const entries = readPackage(file, bytes);
    const changed = new Map<string, string>();
    let translated = 0;
    let untranslated = 0;
    for (const { entry, dialect } of workbookParts(file, entries)) {
      const xml = partText(file, entry);
      let output = "";
      let copied = 0;
      for (const paragraph of withPart(file, entry.name, () => parseParagraphs(xml, dialect))) {
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
