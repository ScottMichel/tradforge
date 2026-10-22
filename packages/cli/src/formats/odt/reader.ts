import { type BinaryReader, ReadError } from "../../core/reader.js";
import type { Occurrence } from "../../core/types.js";
import { partText, readPackage, withPart } from "../office/package.js";
import type { ZipEntry } from "../zip/zip.js";
import { odtParagraphs } from "./paragraphs.js";

const MIMETYPE = "application/vnd.oasis.opendocument.text";

/** The parts of an OpenDocument text that hold texts: the body, then the headers and footers of the styles. */
export function odtParts(file: string, entries: readonly ZipEntry[]): ZipEntry[] {
  const mimetype = entries.find((entry) => entry.name === "mimetype");
  const declared = mimetype === undefined ? undefined : new TextDecoder().decode(mimetype.data()).trim();
  if (declared !== MIMETYPE) {
    throw new ReadError(file, `not an OpenDocument text (mimetype ${declared ?? "missing"})`);
  }
  return ["content.xml", "styles.xml"].flatMap((name) => entries.filter((entry) => entry.name === name));
}

/**
 * Reads the paragraphs and headings of an OpenDocument text (.odt, LibreOffice Writer): each one is a text, its
 * spans and links as tags. The texts of a section, from heading to heading, are translated together.
 */
export const odtReader: BinaryReader = {
  format: "odt",
  binary: true,
  read({ file, bytes, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const part of odtParts(file, readPackage(file, bytes))) {
      const xml = partText(file, part);
      let section = 0;
      withPart(file, part.name, () => odtParagraphs(xml)).forEach((paragraph, index) => {
        if (paragraph.heading) section++;
        occurrences.push({
          source: paragraph.value,
          location: { file, key: `${part.name}#${index + 1}` },
          priority,
          ...(context !== undefined ? { context } : {}),
          group: `${file}#${part.name}#${section}`,
        });
      });
    }
    return occurrences;
  },
};
