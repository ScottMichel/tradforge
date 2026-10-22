import type { FormatDescriptor } from "../../format.js";
import { markedSuggestion } from "../../project/detection.js";
import { yamlReader } from "./reader.js";
import { yamlWriter } from "./writer.js";

/** YAML translation files (Rails, Symfony, i18next, Hugo). */
export const yamlFormat: FormatDescriptor = {
  id: "yaml",
  reader: yamlReader,
  writer: yamlWriter,
  extensions: [".yml", ".yaml"], // Paradox .yml files are recognised by their path first
  /** Only with a marker of the source language in its path: a project holds many YAML files of tools. */
  detect(context) {
    return markedSuggestion("yaml", context) ?? { reason: "no language marker in its path (like locales/en.yml)" };
  },
};
