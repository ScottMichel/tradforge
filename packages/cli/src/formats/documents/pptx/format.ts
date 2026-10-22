import type { FormatDescriptor } from "../../format.js";
import { documentSuggestion } from "../../project/detection.js";
import { pptxReader } from "./reader.js";
import { pptxWriter } from "./writer.js";

/** PowerPoint presentations (.pptx). */
export const pptxFormat: FormatDescriptor = {
  id: "pptx",
  reader: pptxReader,
  writer: pptxWriter,
  extensions: [".pptx"],
  placeholders: ["markup"],
  detect: (context) => documentSuggestion("pptx", context),
};
