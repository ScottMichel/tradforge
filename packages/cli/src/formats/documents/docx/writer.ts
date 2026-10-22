import type { BinaryWriter } from "../../../core/writer.js";
import { partText, readPackage, withPart, writePackage } from "../../shared/office/package.js";
import { parseParagraphs, writeParagraph } from "../../shared/office/paragraphs.js";
import { textParts } from "./reader.js";

/** <w:lang w:val="en-US"/>: the language Word checks a text in. */
const LANGUAGE = /(<w:lang\b[^>]*?\bw:val=")[^"]*(")/g;

/**
 * Writes each translated paragraph of a Word document, its runs rebuilt in the order of the translation, and names
 * the target language in the translated runs and in the document defaults, so that Word checks the spelling of the
 * right language. Every other part of the archive (pictures, settings, relationships) is copied byte for byte. An
 * untranslated paragraph stays as it is; asciiOnly has no effect (the parts are UTF-8).
 */
export const docxWriter: BinaryWriter = {
  format: "docx",
  binary: true,
  write({ file, bytes, translate, languages }) {
    const entries = readPackage(file, bytes);
    const changed = new Map<string, string>();
    let translated = 0;
    let untranslated = 0;
    const withLanguage = (xml: string) => xml.replace(LANGUAGE, `$1${languages.target}$2`);

    for (const part of textParts(file, entries)) {
      const xml = partText(file, part);
      let output = "";
      let copied = 0;
      for (const paragraph of withPart(file, part.name, () => parseParagraphs(xml))) {
        const translation = translate(paragraph.value);
        if (translation === undefined) {
          untranslated++;
          continue;
        }
        translated++;
        output += xml.slice(copied, paragraph.start) + withLanguage(writeParagraph(paragraph, translation));
        copied = paragraph.end;
      }
      if (copied > 0) changed.set(part.name, output + xml.slice(copied));
    }

    const styles = entries.find((entry) => entry.name === "word/styles.xml");
    if (changed.size > 0 && styles !== undefined) {
      const xml = partText(file, styles);
      const defaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(xml);
      if (defaults !== null) {
        const updated = xml.replace(defaults[0], withLanguage(defaults[0]));
        if (updated !== xml) changed.set(styles.name, updated);
      }
    }
    return { bytes: writePackage(bytes, entries, changed), translated, untranslated };
  },
};
