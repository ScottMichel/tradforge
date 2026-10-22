import type { Reader } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { parseHtml } from "./document.js";

/** Reads the texts of an HTML page, and the attributes that people read (alt, title, placeholder, descriptions). */
export const htmlReader: Reader = {
  format: "html",
  read({ file, content, priority, context }) {
    return parseHtml(content).texts.map(
      (text): Occurrence => ({
        source: text.value,
        location: { file, line: text.line },
        priority,
        ...(context !== undefined ? { context } : {}),
      }),
    );
  },
};
