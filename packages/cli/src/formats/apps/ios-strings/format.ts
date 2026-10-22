import path from "node:path";
import type { FormatDescriptor } from "../../format.js";
import { isMarker } from "../../project/detection.js";
import { iosStringsReader } from "./reader.js";
import { iosStringsWriter } from "./writer.js";

/** The .strings files of Apple platforms. */
export const iosStringsFormat: FormatDescriptor = {
  id: "ios-strings",
  reader: iosStringsReader,
  writer: iosStringsWriter,
  extensions: [".strings"],
  // %@, %1$@, %ld
  placeholders: ["printf"],
  /**
   * .strings files sit in a folder per language: en.lproj/Localizable.strings (or Base.lproj, or the old
   * English.lproj). The translations go to fr.lproj/.
   */
  detect({ file, markers, targetLanguage }) {
    const folder = path.posix.dirname(file);
    const parts = folder.split("/");
    const language = /^(.+)\.lproj$/i.exec(parts.at(-1) ?? "")?.[1];
    if (language === undefined) return { reason: "not in a <language>.lproj folder" };
    if (language.toLowerCase() !== "base" && !isMarker(language, markers)) {
      return { reason: "strings of another language" };
    }
    const output = [...parts.slice(0, -1), `${targetLanguage ?? "{lang}"}.lproj`].join("/");
    return { format: "ios-strings", include: `${folder}/*.strings`, output: `${output}/{name}{ext}` };
  },
};
