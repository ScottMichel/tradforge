import type { Reader } from "../../core/reader.js";
import type { Occurrence } from "../../core/types.js";
import { catalogTexts, parseCatalog } from "./catalog.js";

/**
 * Reads every text of the source language of a string catalog (the language the catalog names, whatever the
 * project says), the comment as context. The variations of one string (plural categories) are translated together.
 */
export const xcstringsReader: Reader = {
  format: "xcstrings",
  read({ file, content, priority, context }) {
    return catalogTexts(parseCatalog(file, content)).map((text): Occurrence => {
      const hints = [context, text.comment].filter((hint) => hint !== undefined && hint !== "");
      return {
        source: text.value,
        location: { file, key: [text.key, ...text.variation].join("/") },
        priority,
        ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
        ...(text.variation.length > 0 ? { group: `${file}#${text.key}` } : {}),
      };
    });
  },
};
