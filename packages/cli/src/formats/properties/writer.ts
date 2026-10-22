import { stripBom } from "../../core/reader.js";
import type { Writer } from "../../core/writer.js";
import { encodePropertiesValue, isMessageFormat, parseProperties } from "./syntax.js";

/**
 * Replaces each translated value in place, on one line: keys, separators and comments stay byte for byte. The
 * apostrophes of a MessageFormat text are doubled again. Java 9 and later read .properties bundles as UTF-8;
 * asciiOnly writes \uXXXX escapes for older versions. With "omit", an untranslated entry is left out.
 */
export const propertiesWriter: Writer = {
  format: "properties",
  write({ content, translate, options }) {
    const text = stripBom(content); // the offsets of parseProperties are relative to the text without BOM
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;
    for (const entry of parseProperties(text)) {
      if (entry.value.trim() === "") continue;
      const messageFormat = isMessageFormat(entry.value);
      const translation = translate(messageFormat ? entry.value.replaceAll("''", "'") : entry.value);
      if (translation === undefined) {
        untranslated++;
        if (options.untranslated === "omit") {
          output += text.slice(copied, entry.entryStart);
          copied = entry.entryEnd;
        }
        continue;
      }
      translated++;
      const value = messageFormat ? translation.replaceAll("'", "''") : translation;
      output += text.slice(copied, entry.start) + encodePropertiesValue(value, options.asciiOnly);
      copied = entry.end;
    }
    return { content: output + text.slice(copied), translated, untranslated };
  },
};
