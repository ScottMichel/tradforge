import type { FormatDescriptor } from "../../format.js";
import { markedSuggestion } from "../../project/detection.js";
import { gettextLanguage } from "../po/plurals.js";
import { arbReader } from "./reader.js";
import { arbWriter } from "./writer.js";

/** Flutter's Application Resource Bundles (.arb). */
export const arbFormat: FormatDescriptor = {
  id: "arb",
  reader: arbReader,
  writer: arbWriter,
  extensions: [".arb"],
  /** app_en.arb → app_fr.arb; Flutter writes the region after an underscore: app_pt_BR.arb. */
  detect(context) {
    const marked = markedSuggestion("arb", context);
    if (marked === undefined) return { reason: "no language marker in its name (like app_en.arb)" };
    const { targetLanguage } = context;
    return targetLanguage === undefined
      ? marked
      : { ...marked, output: marked.output.replace("{lang}", gettextLanguage(targetLanguage)) };
  },
};
