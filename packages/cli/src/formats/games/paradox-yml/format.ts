import path from "node:path";
import type { FormatDescriptor } from "../../format.js";
import { paradoxLanguage } from "./languages.js";
import { paradoxReader } from "./reader.js";
import { paradoxWriter } from "./writer.js";

/** Paradox localisation files (.yml, Paradox dialect). */
export const paradoxFormat: FormatDescriptor = {
  id: "paradox-yml",
  reader: paradoxReader,
  writer: paradoxWriter,
  extensions: [], // .yml is too generic: Paradox files are recognised by their name (ui_l_english.yml)
  // $VAR$, §Y§!, £icon£, [Root.GetName]: right in those games, wrong elsewhere
  placeholders: ["paradox"],
  /**
   * <...>/english/name_l_english.yml. The game's language names are used ("braz_por"), and the files must start
   * with a byte order mark.
   */
  detect({ file, sourceLanguage, targetLanguage }) {
    const source = paradoxLanguage(sourceLanguage);
    if (!file.toLowerCase().endsWith(`_l_${source}.yml`)) return undefined;
    const target = targetLanguage === undefined ? "{language}" : paradoxLanguage(targetLanguage);
    const folder = path.posix.dirname(file);
    const output = folder
      .split("/")
      .map((part) => (part.toLowerCase() === source ? target : part))
      .join("/");
    return {
      format: "paradox-yml",
      include: `${folder}/*_l_${source}.yml`,
      output: `${output}/{stem}_l_${target}{ext}`,
      encoding: "utf-8-bom",
    };
  },
};
