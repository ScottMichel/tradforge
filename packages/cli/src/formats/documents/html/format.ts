import path from "node:path";
import { languageName } from "../../../core/languages.js";
import type { FormatDescriptor } from "../../format.js";
import { baseLanguage, markedSuggestion, readHead } from "../../project/detection.js";
import { htmlReader } from "./reader.js";
import { htmlWriter } from "./writer.js";

/** Folders that tools fill with generated pages (test coverage, builds). */
const BUILD_FOLDERS = /(?:^|\/)(?:coverage|dist|build|out|target|_site|public\/build)(?:\/|$)/i;

/** HTML pages (.html, .htm). */
export const htmlFormat: FormatDescriptor = {
  id: "html",
  reader: htmlReader,
  writer: htmlWriter,
  extensions: [".html", ".htm"],
  // the inline tags of a text (<a>, <strong>, <br>) must all come back
  placeholders: ["markup"],
  /**
   * Pages with a marker of the source language in their path (en/index.html, about.en.html), or that declare it
   * (<html lang="en">). Pages of build and coverage folders are generated, not written: they are left out. A page
   * that declares no language is left out too: a project holds many generated or third-party pages.
   */
  async detect(context) {
    const { file, sourceLanguage } = context;
    if (BUILD_FOLDERS.test(path.posix.dirname(file))) return { reason: "a generated page (build or coverage folder)" };
    const marked = markedSuggestion("html", context);
    if (marked !== undefined) return marked;
    const declared = /<html[^>]*\slang\s*=\s*["']?([\w-]+)/i.exec(await readHead(context, 4096))?.[1];
    if (declared === undefined) return { reason: 'no language marker in its path, and no <html lang="...">' };
    if (baseLanguage(declared) !== baseLanguage(sourceLanguage))
      return { reason: `a page in ${languageName(declared)}` };
    // A separate folder per language, as static sites have it: fr/index.html.
    return { format: "html", include: file, output: "{lang}/{dir}/{name}{ext}" };
  },
};
