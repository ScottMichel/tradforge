import type { Reader } from "../../core/reader.js";
import type { Occurrence } from "../../core/types.js";
import { markdownTexts } from "./blocks.js";

/** Reads the texts of a Markdown document, block by block; the texts of a section are translated together. */
export const markdownReader: Reader = {
  format: "markdown",
  read({ file, content, priority, context }) {
    return markdownTexts(file, content).map(
      (text): Occurrence => ({
        source: text.value,
        location: { file, line: text.line },
        priority,
        ...(context !== undefined ? { context } : {}),
        group: `${file}#${text.section}`,
      }),
    );
  },
};
