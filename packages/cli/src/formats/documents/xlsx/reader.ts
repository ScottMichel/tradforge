import { type BinaryReader, ReadError } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { partText, readPackage, withPart } from "../../shared/office/package.js";
import { type Dialect, DRAWING, INLINE_STRING, parseParagraphs, SPREADSHEET } from "../../shared/office/paragraphs.js";
import type { ZipEntry } from "../../shared/zip/zip.js";

/** A part of a workbook that holds texts, with the dialect of its paragraphs and what to tell the translator. */
export interface WorkbookPart {
  readonly entry: ZipEntry;
  readonly dialect: Dialect;
  readonly context?: string;
}

const PARTS: readonly { readonly pattern: RegExp; readonly dialect: Dialect; readonly label?: string }[] = [
  { pattern: /^xl\/sharedStrings\.xml$/, dialect: SPREADSHEET },
  { pattern: /^xl\/worksheets\/sheet(\d+)\.xml$/, dialect: INLINE_STRING, label: "sheet" },
  { pattern: /^xl\/drawings\/drawing(\d+)\.xml$/, dialect: DRAWING, label: "drawing" },
];

/**
 * The parts of a workbook that hold texts: the shared strings (most cells point to one), the inline strings of the
 * sheets, and the text boxes of the drawings. Sheet names stay as they are: formulas and defined names refer to them.
 */
export function workbookParts(file: string, entries: readonly ZipEntry[]): WorkbookPart[] {
  if (!entries.some((entry) => entry.name === "xl/workbook.xml")) {
    throw new ReadError(file, "not an Excel workbook (no xl/workbook.xml)");
  }
  const found: (WorkbookPart & { readonly rank: number; readonly number: number })[] = [];
  for (const entry of entries) {
    PARTS.forEach(({ pattern, dialect, label }, rank) => {
      const match = pattern.exec(entry.name);
      if (match === null) return;
      const number = Number(match[1] ?? 0);
      found.push({ entry, dialect, rank, number, ...(label !== undefined ? { context: `${label} ${number}` } : {}) });
    });
  }
  return found.sort((a, b) => a.rank - b.rank || a.number - b.number);
}

/**
 * Reads the texts of an Excel workbook (.xlsx). A shared string is translated once for every cell that shows it;
 * a string with letters only: numbers stored as text and codes without letters are left out.
 */
export const xlsxReader: BinaryReader = {
  format: "xlsx",
  binary: true,
  read({ file, bytes, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const { entry, dialect, context: where } of workbookParts(file, readPackage(file, bytes))) {
      const xml = partText(file, entry);
      const hints = [context, where].filter((hint) => hint !== undefined && hint !== "");
      withPart(file, entry.name, () => parseParagraphs(xml, dialect)).forEach((paragraph, index) => {
        occurrences.push({
          source: paragraph.value,
          location: { file, key: `${entry.name}#${index + 1}` },
          priority,
          ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
        });
      });
    }
    return occurrences;
  },
};
