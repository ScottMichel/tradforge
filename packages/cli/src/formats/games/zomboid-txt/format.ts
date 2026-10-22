import path from "node:path";
import type { FormatDescriptor } from "../../format.js";
import { pzLanguageCode } from "./languages.js";
import { pzReader } from "./reader.js";
import { pzWriter } from "./writer.js";

/** Project Zomboid Build 41 translation tables (.txt). */
export const zomboidFormat: FormatDescriptor = {
  id: "zomboid-txt",
  reader: pzReader,
  writer: pzWriter,
  extensions: [], // .txt is too generic: the tables are recognised by their path
  /** <...>/Translate/EN/UI_EN.txt, translated with the folder codes of the game when the target language is known. */
  detect({ file, sourceLanguage, targetLanguage }) {
    const code = pzLanguageCode(sourceLanguage);
    const folder = path.posix.dirname(file);
    const parts = folder.split("/");
    const isTable =
      parts.at(-2)?.toLowerCase() === "translate" &&
      parts.at(-1)?.toUpperCase() === code &&
      file.toUpperCase().endsWith(`_${code}.TXT`);
    if (!isTable) return undefined;
    const target = targetLanguage === undefined ? "{LANG}" : pzLanguageCode(targetLanguage);
    const output = [...parts.slice(0, -1), target].join("/");
    return {
      format: "zomboid-txt",
      include: `${folder}/*_${parts.at(-1)}.txt`,
      output: `${output}/{stem}_${target}{ext}`,
    };
  },
};
