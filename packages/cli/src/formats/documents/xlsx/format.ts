import type { FormatDescriptor } from "../../format.js";
import { documentSuggestion } from "../../project/detection.js";
import { xlsxReader } from "./reader.js";
import { xlsxWriter } from "./writer.js";

/** Excel workbooks (.xlsx). */
export const xlsxFormat: FormatDescriptor = {
  id: "xlsx",
  reader: xlsxReader,
  writer: xlsxWriter,
  extensions: [".xlsx"],
  placeholders: ["markup"],
  detect: (context) => documentSuggestion("xlsx", context),
};
