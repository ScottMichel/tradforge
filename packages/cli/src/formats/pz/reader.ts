import type { Reader } from "../../core/reader.js";
import { parsePzTranslation } from "./translation.js";

/** Project Zomboid Build 41 translation tables (Translate/EN/*_EN.txt). Build 42 files are JSON: use "json". */
export const pzReader: Reader = {
  format: "zomboid-txt",
  read({ file, content, priority, context }) {
    const { lines, entries } = parsePzTranslation(content);
    let blockStart = 0;
    return entries.map((entry, index) => {
      const previous = entries[index - 1];
      const blank =
        previous !== undefined && lines.slice(previous.end + 1, entry.start).some((line) => line.trim() === "");
      if (previous === undefined || blank) blockStart = entry.start + 1;
      return {
        source: entry.value,
        location: { file, key: entry.key, line: entry.start + 1 },
        priority,
        ...(context !== undefined ? { context } : {}),
        // Entries that no blank line separates belong together, like paragraphs.
        group: `${file}#${blockStart}`,
      };
    });
  },
};
