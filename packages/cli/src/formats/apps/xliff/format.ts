import path from "node:path";
import { languageName } from "../../../core/languages.js";
import type { FormatDescriptor } from "../../format.js";
import { baseLanguage, folderPrefix, markedSuggestion, readHead } from "../../project/detection.js";
import { xliffReader } from "./reader.js";
import { xliffWriter } from "./writer.js";

/** XLIFF 1.2 and 2.x (.xlf, .xliff). */
export const xliffFormat: FormatDescriptor = {
  id: "xliff",
  reader: xliffReader,
  writer: xliffWriter,
  extensions: [".xlf", ".xliff"],
  // inline elements (<x/>, <g>, <ph>, <pc>) must all come back, whatever the configuration says
  placeholders: ["markup"],
  /**
   * An XLIFF file in the source language that holds no translation yet. The translation goes next to it, as Angular
   * names it (messages.xlf → messages.fr.xlf), unless the path has a marker of the language to replace. A file that
   * already names a target language is the translation of another language.
   */
  async detect(context) {
    const { file, sourceLanguage } = context;
    const head = await readHead(context, 4096);
    if (!/<(?:[\w-]+:)?xliff[\s>]/.test(head)) return { reason: "not an XLIFF document" };
    const language = (pattern: RegExp) => pattern.exec(head)?.[1];
    const source = language(/\s(?:source-language|srcLang)\s*=\s*["']([^"']+)/);
    if (source !== undefined && baseLanguage(source) !== baseLanguage(sourceLanguage)) {
      return { reason: `its source language is ${languageName(source)}` };
    }
    const target = language(/\s(?:target-language|trgLang)\s*=\s*["']([^"']+)/);
    if (target !== undefined) return { reason: `already a translation into ${languageName(target)}` };
    const marked = markedSuggestion("xliff", context);
    if (marked !== undefined) return marked;
    const extension = path.posix.extname(file);
    const name = path.posix.basename(file, extension);
    return { format: "xliff", include: file, output: `${folderPrefix(file)}${name}.{lang}${extension}` };
  },
};
