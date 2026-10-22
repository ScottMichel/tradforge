import type { BinaryWriter } from "../../../core/writer.js";
import { partText, readPackage, withPart, writePackage } from "../../shared/office/package.js";
import { odtParagraphs, writeOdtParagraph } from "./paragraphs.js";
import { odtParts } from "./reader.js";

/**
 * Writes each translated paragraph of an OpenDocument text, and names the target language in its styles
 * (fo:language, fo:country), so that LibreOffice checks the right spelling. The mimetype stays the first entry,
 * stored, as ODF requires; every other part is copied byte for byte. An untranslated paragraph stays as it is.
 */
export const odtWriter: BinaryWriter = {
  format: "odt",
  binary: true,
  write({ file, bytes, translate, languages }) {
    const entries = readPackage(file, bytes);
    const written = new Map<string, { readonly before: string; readonly after: string }>();
    let translated = 0;
    let untranslated = 0;
    for (const part of odtParts(file, entries)) {
      const xml = partText(file, part);
      let output = "";
      let copied = 0;
      for (const paragraph of withPart(file, part.name, () => odtParagraphs(xml))) {
        const translation = translate(paragraph.value);
        if (translation === undefined) {
          untranslated++;
          continue;
        }
        translated++;
        output += xml.slice(copied, paragraph.start) + writeOdtParagraph(paragraph, translation);
        copied = paragraph.end;
      }
      written.set(part.name, { before: xml, after: output + xml.slice(copied) });
    }
    // Only a translated document gets the target language; only the parts that change are written again.
    const changed = new Map<string, string>();
    if (translated > 0) {
      for (const [name, { before, after }] of written) {
        const final = withLanguage(after, languages.target);
        if (final !== before) changed.set(name, final);
      }
    }
    return { bytes: writePackage(bytes, entries, changed), translated, untranslated };
  },
};

/** fo:language="en" fo:country="US" → the target language, and its region (or "none"). */
function withLanguage(xml: string, target: string): string {
  const [language = target, region] = target.split(/[-_]/);
  return xml
    .replace(/\bfo:language="[^"]*"/g, `fo:language="${language.toLowerCase()}"`)
    .replace(/\bfo:country="[^"]*"/g, `fo:country="${region === undefined ? "none" : region.toUpperCase()}"`);
}
