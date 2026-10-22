import { type BinaryReader, ReadError } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { partText, readPackage, withPart } from "../../shared/office/package.js";
import { parseParagraphs } from "../../shared/office/paragraphs.js";
import type { ZipEntry } from "../../shared/zip/zip.js";

/** The parts of a Word document that hold texts for readers: the body, then headers, footers and notes. */
const TEXT_PART = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
/** Paragraph styles that open a new section: the texts of a section are translated together. */
const HEADING = /heading|title|titre|berschrift|titolo|ttulo/i;

export function textParts(file: string, entries: readonly ZipEntry[]): ZipEntry[] {
  const parts = entries.filter((entry) => TEXT_PART.test(entry.name));
  if (!parts.some((entry) => entry.name === "word/document.xml")) {
    throw new ReadError(file, "not a Word document (no word/document.xml)");
  }
  const rank = (name: string) => (name === "word/document.xml" ? "" : name);
  return parts.sort((a, b) => (rank(a.name) < rank(b.name) ? -1 : 1));
}

/**
 * Reads the paragraphs of a Word document (.docx): each paragraph is one text, its formats as tags. The paragraph
 * style goes to the translator as context.
 */
export const docxReader: BinaryReader = {
  format: "docx",
  binary: true,
  read({ file, bytes, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const part of textParts(file, readPackage(file, bytes))) {
      const xml = partText(file, part);
      let section = 0;
      withPart(file, part.name, () => parseParagraphs(xml)).forEach((paragraph, index) => {
        if (paragraph.style !== undefined && HEADING.test(paragraph.style)) section++;
        const hints = [context, paragraph.style].filter((hint) => hint !== undefined && hint !== "");
        occurrences.push({
          source: paragraph.value,
          location: { file, key: `${part.name}#${index + 1}` },
          priority,
          ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
          group: `${file}#${part.name}#${section}`,
        });
      });
    }
    return occurrences;
  },
};
