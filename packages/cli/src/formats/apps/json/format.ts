import path from "node:path";
import type { FormatDescriptor } from "../../format.js";
import { pzLanguageCode } from "../../games/zomboid-txt/languages.js";
import { markedSuggestion } from "../../project/detection.js";
import { jsonReader } from "./reader.js";
import { jsonWriter } from "./writer.js";

/** JSON files that configure tools (or describe a language) rather than hold texts. */
const TOOL_CONFIGURATION =
  /^(package|package-lock|composer|biome|jsconfig.*|tsconfig.*|tradforge\.config|language|.*\.schema)\.json$/i;

/** JSON translation files (locales/en/ui.json, ui.en.json; also Project Zomboid Build 42). */
export const jsonFormat: FormatDescriptor = {
  id: "json",
  reader: jsonReader,
  writer: jsonWriter,
  extensions: [".json"],
  /**
   * Only with a marker of the source language in its path: a project holds many JSON files that are not texts.
   * Project Zomboid Build 42 translations (Translate/EN/) get the folder codes of the game.
   */
  detect(context) {
    if (TOOL_CONFIGURATION.test(path.posix.basename(context.file))) return { reason: "configuration file of a tool" };
    const { targetLanguage } = context;
    const suggestion = markedSuggestion("json", context, (_marker, folders, index) =>
      folders[index - 1]?.toLowerCase() === "translate" && targetLanguage !== undefined
        ? pzLanguageCode(targetLanguage)
        : undefined,
    );
    return suggestion ?? { reason: "no language marker in its path (like locales/en/ or ui.en.json)" };
  },
};
