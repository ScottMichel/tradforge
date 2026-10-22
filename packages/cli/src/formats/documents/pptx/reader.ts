import { type BinaryReader, ReadError } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { partText, readPackage, withPart } from "../../shared/office/package.js";
import { DRAWING, parseParagraphs } from "../../shared/office/paragraphs.js";
import type { ZipEntry } from "../../shared/zip/zip.js";

/** A slide or the speaker notes of a slide, with the number of the slide. */
export interface SlidePart {
  readonly entry: ZipEntry;
  readonly slide: number;
  readonly notes: boolean;
}

const SLIDE = /^ppt\/(slides\/slide|notesSlides\/notesSlide)(\d+)\.xml$/;

/**
 * The parts of a presentation that hold texts for the audience: the slides by number, then the speaker notes.
 * Masters and layouts are templates ("Click to add title"), not the presentation's texts.
 */
export function slideParts(file: string, entries: readonly ZipEntry[]): SlidePart[] {
  const parts = entries.flatMap((entry): SlidePart[] => {
    const match = SLIDE.exec(entry.name);
    return match === null ? [] : [{ entry, slide: Number(match[2]), notes: match[1] !== "slides/slide" }];
  });
  if (!parts.some((part) => !part.notes)) throw new ReadError(file, "not a PowerPoint presentation (no ppt/slides/)");
  return parts.sort((a, b) => Number(a.notes) - Number(b.notes) || a.slide - b.slide);
}

/**
 * Reads the paragraphs of a PowerPoint presentation (.pptx): text boxes, shapes and tables of every slide, then the
 * speaker notes. Each paragraph is one text, its formats as tags; the texts of a slide are translated together.
 */
export const pptxReader: BinaryReader = {
  format: "pptx",
  binary: true,
  read({ file, bytes, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const { entry, slide, notes } of slideParts(file, readPackage(file, bytes))) {
      const xml = partText(file, entry);
      const where = notes ? `speaker notes of slide ${slide}` : `slide ${slide}`;
      const hint = [context, where].filter((part) => part !== undefined && part !== "").join(" | ");
      withPart(file, entry.name, () => parseParagraphs(xml, DRAWING)).forEach((paragraph, index) => {
        occurrences.push({
          source: paragraph.value,
          location: { file, key: `${entry.name}#${index + 1}` },
          priority,
          context: hint,
          group: `${file}#slide${slide}`,
        });
      });
    }
    return occurrences;
  },
};
