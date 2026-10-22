import path from "node:path";
import { languageName } from "../../../core/languages.js";
import type { FormatDescriptor } from "../../format.js";
import { baseLanguage, folderPrefix, readHead } from "../../project/detection.js";
import { resxReader } from "./reader.js";
import { parseResx } from "./resources.js";
import { resxWriter } from "./writer.js";

/** .NET resources (.resx). */
export const resxFormat: FormatDescriptor = {
  id: "resx",
  reader: resxReader,
  writer: resxWriter,
  extensions: [".resx"],
  /**
   * Strings.resx (neutral, in the source language) or Strings.en.resx, whose translations are Strings.fr.resx.
   * Files of other cultures, and those without strings (images, forms), are left out.
   */
  async detect(context) {
    const { file, sourceLanguage, targetLanguage } = context;
    const name = path.posix.basename(file, path.posix.extname(file));
    const culture = /^(.+)\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)$/.exec(name);
    const code = culture?.[2];
    const isCulture = code !== undefined && languageName(code) !== code;
    if (isCulture && baseLanguage(code) !== baseLanguage(sourceLanguage)) {
      return { reason: "resources of another culture" };
    }
    let strings: number;
    try {
      strings = parseResx(file, await readHead(context, Number.POSITIVE_INFINITY)).length;
    } catch {
      return { reason: "not a readable .resx file" };
    }
    if (strings === 0) return { reason: "no strings (images, files or form data only)" };
    const base = isCulture ? (culture?.[1] ?? name) : name;
    return { format: "resx", include: file, output: `${folderPrefix(file)}${base}.${targetLanguage ?? "{lang}"}.resx` };
  },
};
