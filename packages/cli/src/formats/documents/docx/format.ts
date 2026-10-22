import type { FormatDescriptor } from "../../format.js";
import { documentSuggestion } from "../../project/detection.js";
import { docxReader } from "./reader.js";
import { docxWriter } from "./writer.js";

/** Word documents (.docx). */
export const docxFormat: FormatDescriptor = {
  id: "docx",
  reader: docxReader,
  writer: docxWriter,
  extensions: [".docx"],
  // the tags that stand for formats (<g1>), fields and pictures (<x1/>)
  placeholders: ["markup"],
  detect: (context) => documentSuggestion("docx", context),
};
