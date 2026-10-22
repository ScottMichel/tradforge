import type { Writer } from "../../../core/writer.js";
import { serializeJson } from "../json/writer.js";
import { gettextLanguage } from "../po/plurals.js";
import { parseArb } from "./reader.js";

/**
 * Translates the messages of an .arb file and names the target locale in "@@locale", as Flutter writes it ("pt_BR").
 * Metadata stays as it is. With "omit", an untranslated message is left out with its metadata.
 */
export const arbWriter: Writer = {
  format: "arb",
  write({ file, content, translate, options, languages }) {
    const data = parseArb(file, content);
    const omitted = new Set<string>();
    const entries: [string, unknown][] = [];
    let translated = 0;
    let untranslated = 0;
    for (const [key, value] of Object.entries(data)) {
      if (key === "@@locale") {
        entries.push([key, gettextLanguage(languages.target)]);
        continue;
      }
      if (key.startsWith("@") || typeof value !== "string" || value.trim() === "") {
        entries.push([key, value]);
        continue;
      }
      const translation = translate(value);
      if (translation !== undefined) {
        translated++;
        entries.push([key, translation]);
      } else {
        untranslated++;
        if (options.untranslated === "omit") omitted.add(key);
        else entries.push([key, value]);
      }
    }
    const kept = entries.filter(
      ([key]) => !(key.startsWith("@") && !key.startsWith("@@") && omitted.has(key.slice(1))),
    );
    return { content: serializeJson(Object.fromEntries(kept), content, options.asciiOnly), translated, untranslated };
  },
};
