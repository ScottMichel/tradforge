import { ReadError, stripBom } from "../../core/reader.js";
import { XmlSyntaxError } from "../xml/parser.js";
import { readZip, writeZip, type ZipEntry, ZipError } from "../zip/zip.js";

/**
 * Office documents (.docx, .pptx, .xlsx, .odt) are ZIP archives of XML parts. These helpers read the parts and write
 * the archive back with only the changed parts recompressed: every other part (pictures, settings) stays byte for
 * byte, in the same order.
 */

export function readPackage(file: string, bytes: Uint8Array): ZipEntry[] {
  try {
    return readZip(bytes);
  } catch (error) {
    if (error instanceof ZipError) throw new ReadError(file, error.message, { cause: error });
    throw error;
  }
}

/** The text of an XML part (UTF-8, as office documents write them). */
export function partText(file: string, entry: ZipEntry): string {
  try {
    return stripBom(new TextDecoder().decode(entry.data()));
  } catch (error) {
    if (error instanceof ZipError) throw new ReadError(file, error.message, { cause: error });
    throw error;
  }
}

/** Runs a parser on a part; an XML error names the file and the part. */
export function withPart<T>(file: string, part: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof XmlSyntaxError) throw new ReadError(file, `${part}: ${error.message}`, { cause: error });
    throw error;
  }
}

/** The archive with some parts replaced; the source bytes themselves when nothing changed. */
export function writePackage(
  source: Uint8Array,
  entries: readonly ZipEntry[],
  changed: ReadonlyMap<string, string>,
): Uint8Array {
  if (changed.size === 0) return source;
  return writeZip(
    entries.map((entry) => {
      const text = changed.get(entry.name);
      if (text === undefined) return { raw: entry };
      return {
        name: entry.name,
        data: new TextEncoder().encode(text),
        compress: entry.method === 8,
        modified: { date: entry.date, time: entry.time },
      };
    }),
  );
}
