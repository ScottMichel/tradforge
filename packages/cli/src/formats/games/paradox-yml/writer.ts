import { stripBom } from "../../../core/reader.js";
import type { Writer } from "../../../core/writer.js";
import { paradoxLanguage } from "./languages.js";
import { encodeParadoxText, parseParadox } from "./syntax.js";

export { encodeParadoxText } from "./syntax.js";

/**
 * Replaces the text of each translated entry in place and renames the language of every header
 * ("l_english:" → "l_french:"): keys, version numbers, comments and indentation stay byte for byte.
 *
 * The output has no byte order mark, although the games require one: the "utf-8-bom" output encoding adds it, and
 * keeping the mark here would write it twice. Non-ASCII characters are never escaped (the format has no escape for
 * them, and the files are UTF-8), so asciiOnly has no effect.
 */
export const paradoxWriter: Writer = {
  format: "paradox-yml",
  write({ file, content, translate, options, languages }) {
    const text = stripBom(content); // the offsets of parseParadox are relative to the text without BOM
    const language = paradoxLanguage(languages.target);
    let output = "";
    let copied = 0;
    let translated = 0;
    let untranslated = 0;

    for (const item of parseParadox(file, text)) {
      if (item.kind === "header") {
        output += text.slice(copied, item.start) + language;
        copied = item.end;
        continue;
      }
      if (item.value.trim() === "") continue; // never extracted, so never translated
      const translation = translate(item.value);
      if (translation !== undefined) {
        translated++;
        output += text.slice(copied, item.start) + encodeParadoxText(translation);
        copied = item.end;
      } else {
        untranslated++;
        if (options.untranslated === "omit") {
          output += text.slice(copied, item.lineStart);
          copied = item.lineEnd;
        }
      }
    }
    output += text.slice(copied);
    return { content: output, translated, untranslated };
  },
};
