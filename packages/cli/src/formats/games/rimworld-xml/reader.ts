import { type Reader, stripBom } from "../../../core/reader.js";
import { extractRimWorldTexts, type RimWorldText } from "./texts.js";

/** Files below a DefInjected folder translate the fields of defs: "TF_Bucket.label". */
const DEF_INJECTED = /(^|\/)DefInjected\//i;

/**
 * Reads the language files of RimWorld mods (Languages/<Language>/Keyed and DefInjected): one occurrence per text
 * element, keyed by its path ("TF_Key", "TF_Def.label", "TF_Def.rulesStrings.0").
 */
export const rimworldReader: Reader = {
  format: "rimworld-xml",
  read({ file, content, priority, context }) {
    const text = stripBom(content);
    const texts = extractRimWorldTexts(file, text);
    const defInjected = DEF_INJECTED.test(file);
    let blockStart = 0;
    return texts.map((found, index) => {
      const previous = texts[index - 1];
      if (previous === undefined || hasBlankLineBetween(text, previous, found)) blockStart = found.element.line;
      return {
        source: found.value,
        location: { file, key: found.key, line: found.element.line },
        priority,
        ...(context !== undefined ? { context } : {}),
        // DefInjected: the fields of one def (its label, description, rules) belong together.
        // Keyed: keys are flat, so blocks that no blank line separates play the role of paragraphs.
        group: defInjected ? `${file}#${defName(found.key)}` : `${file}#${blockStart}`,
      };
    });
  },
};

/** "TF_Bucket.label" → "TF_Bucket". */
function defName(key: string): string {
  const dot = key.indexOf(".");
  return dot === -1 ? key : key.slice(0, dot);
}

/** True if an empty (or only spaces) line separates two elements. */
function hasBlankLineBetween(content: string, previous: RimWorldText, next: RimWorldText): boolean {
  const lines = content.slice(previous.element.end, next.element.start).split(/\r\n|\r|\n/);
  // The first and last parts are the ends of the lines of the two elements: only the lines between them count.
  return lines.slice(1, -1).some((line) => line.trim() === "");
}
