import path from "node:path";
import type { FormatDescriptor } from "../../format.js";
import { folderPrefix, markedSuggestion, nameInAnotherLanguage } from "../../project/detection.js";
import { markdownReader } from "./reader.js";
import { markdownWriter } from "./writer.js";

/** Folders that hold documentation for readers. */
const DOCUMENT_FOLDERS = /(?:^|\/)(?:docs?|documentation|content|guides?|wiki|manual|site)(?:\/|$)/i;
/** Documents of a project that are rarely translated. */
const PROJECT_FILES =
  /^(?:changelog|changes|history|license|licence|copying|notice|authors|contributors|code_of_conduct|security)$/i;

/** Markdown documents (.md, .markdown). */
export const markdownFormat: FormatDescriptor = {
  id: "markdown",
  reader: markdownReader,
  writer: markdownWriter,
  extensions: [".md", ".markdown"],
  // inline code and link destinations, and the HTML tags a document may hold
  placeholders: ["markdown", "markup"],
  /**
   * Documents with a marker of the source language (docs/en/, guide.en.md), READMEs, and the documents of a
   * documentation folder (docs/, content/). A translation goes next to its source: README.fr.md. Documents in
   * another language, and changelogs or licences, are left out.
   */
  detect(context) {
    const marked = markedSuggestion("markdown", context);
    if (marked !== undefined) return marked;
    const { file } = context;
    const extension = path.posix.extname(file);
    const name = path.posix.basename(file, extension);
    if (nameInAnotherLanguage(name)) return { reason: "a document in another language" };
    if (PROJECT_FILES.test(name))
      return { reason: "a project file rarely translated (add it to sources to translate it)" };
    if (!/^readme$/i.test(name) && !DOCUMENT_FOLDERS.test(path.posix.dirname(file))) {
      return { reason: "neither a README nor in a documentation folder (docs/, content/)" };
    }
    return { format: "markdown", include: file, output: `${folderPrefix(file)}${name}.{lang}${extension}` };
  },
};
