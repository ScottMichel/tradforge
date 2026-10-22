import path from "node:path";
import { languageName } from "../../../core/languages.js";
import type { FormatDescriptor } from "../../format.js";
import { folderPrefix, markedSuggestion } from "../../project/detection.js";
import { poReader } from "./reader.js";
import { poWriter } from "./writer.js";

/** gettext catalogs and templates (.po, .pot). */
export const poFormat: FormatDescriptor = {
  id: "po",
  reader: poReader,
  writer: poWriter,
  extensions: [".po", ".pot"],
  /**
   * A template (.pot) is always in the source language: the translations go next to it in a po/ folder (po/fr.po,
   * as GNU projects do), or where gettext looks for them at run time (locale/fr/LC_MESSAGES/x.po). A .po needs a
   * marker of the source language in its path (locale/en/LC_MESSAGES/x.po, po/en.po): the others are the
   * translations of other languages.
   */
  detect(context) {
    const { file, sourceLanguage } = context;
    const prefix = folderPrefix(file);
    if (path.posix.extname(file).toLowerCase() === ".pot") {
      const gnu = path.posix.basename(path.posix.dirname(file)).toLowerCase() === "po";
      return {
        format: "po",
        include: file,
        output: gnu ? `${prefix}{lang}.po` : `${prefix}{lang}/LC_MESSAGES/{name}.po`,
      };
    }
    return (
      markedSuggestion("po", context) ?? {
        reason: `no marker of ${languageName(sourceLanguage)} in its path (like locale/en/LC_MESSAGES/ or en.po)`,
      }
    );
  },
};
