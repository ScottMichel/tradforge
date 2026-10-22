import type { FormatDescriptor } from "../../format.js";
import { xcstringsReader } from "./reader.js";
import { xcstringsWriter } from "./writer.js";

/** Xcode string catalogs (.xcstrings). */
export const xcstringsFormat: FormatDescriptor = {
  id: "xcstrings",
  reader: xcstringsReader,
  writer: xcstringsWriter,
  extensions: [".xcstrings"],
  placeholders: ["printf"],
  multilingual: true,
  /** A string catalog holds every language: the translation goes into the catalog itself. */
  detect({ file }) {
    return { format: "xcstrings", include: file, output: "{dir}/{name}{ext}" };
  },
};
