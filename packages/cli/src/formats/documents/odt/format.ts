import type { FormatDescriptor } from "../../format.js";
import { documentSuggestion } from "../../project/detection.js";
import { odtReader } from "./reader.js";
import { odtWriter } from "./writer.js";

/** OpenDocument texts (.odt, LibreOffice Writer). */
export const odtFormat: FormatDescriptor = {
  id: "odt",
  reader: odtReader,
  writer: odtWriter,
  extensions: [".odt"],
  placeholders: ["markup"],
  detect: (context) => documentSuggestion("odt", context),
};
