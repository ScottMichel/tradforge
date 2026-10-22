import { stripBom } from "../../core/reader.js";
import type { Writer } from "../../core/writer.js";
import { encodeIosString, parseIosStrings } from "./strings.js";

/**
 * Replaces each translated value in place: keys, comments and layout stay byte for byte. With "omit", an untranslated
 * entry is left out with its comment. The output is UTF-8, which Xcode reads; an "utf-16le" output encoding gives the
 * UTF-16 of older projects.
 */
export const iosStringsWriter: Writer = {
  format: "ios-strings",
  write({ file, content, translate, options }) {
    const text = stripBom(content); // the offsets of parseIosStrings are relative to the text without BOM
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;
    for (const entry of parseIosStrings(file, text)) {
      if (entry.value.trim() === "") continue;
      const translation = translate(entry.value);
      if (translation !== undefined) {
        translated++;
        output += text.slice(copied, entry.start) + encodeIosString(translation, options.asciiOnly);
        copied = entry.end;
      } else {
        untranslated++;
        if (options.untranslated === "omit") {
          output += text.slice(copied, entry.entryStart);
          copied = entry.entryEnd;
        }
      }
    }
    return { content: output + text.slice(copied), translated, untranslated };
  },
};
