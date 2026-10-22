import path from "node:path";
import { languageName } from "../../../core/languages.js";
import type { FormatDescriptor } from "../../format.js";
import { readHead } from "../../project/detection.js";
import { rimworldReader } from "./reader.js";
import { rimworldWriter } from "./writer.js";

/** RimWorld language data (.xml, <LanguageData> root). */
export const rimworldFormat: FormatDescriptor = {
  id: "rimworld-xml",
  reader: rimworldReader,
  writer: rimworldWriter,
  extensions: [], // .xml is too generic: RimWorld files are recognised by their path (Languages/English/Keyed/)
  // grammar symbols [PAWN_nameDef] and rule heads
  placeholders: ["rimworld"],
  /**
   * <...>/Languages/English/Keyed/*.xml or .../DefInjected/<DefType>/*.xml, whose root is LanguageData
   * (LanguageInfo.xml and other XML files of the folder are left out).
   */
  async detect(context) {
    const { file, sourceLanguage, targetLanguage } = context;
    if (!file.toLowerCase().endsWith(".xml")) return undefined;
    const parts = path.posix.dirname(file).split("/");
    const english = languageName(sourceLanguage).toLowerCase();
    const index = parts.findIndex(
      (part, i) =>
        part.toLowerCase() === "languages" &&
        (parts[i + 1]?.toLowerCase().startsWith(english) ?? false) &&
        ["keyed", "definjected"].includes(parts[i + 2]?.toLowerCase() ?? ""),
    );
    const isLanguageInfo =
      parts.at(-2)?.toLowerCase() === "languages" && parts.at(-1)?.toLowerCase().startsWith(english) === true;
    if (index === -1 && !isLanguageInfo) return undefined;

    if (index === -1 || !/<LanguageData[\s>/]/.test(await readHead(context, 1024))) {
      return { reason: "not a RimWorld language file (its root is not LanguageData)" };
    }
    const target = targetLanguage === undefined ? "{language}" : languageName(targetLanguage);
    const output = parts.map((part, i) => (i === index + 1 ? target : part)).join("/");
    return { format: "rimworld-xml", include: `${parts.join("/")}/*.xml`, output: `${output}/{name}{ext}` };
  },
};
