import { stripBom } from "../../core/reader.js";
import type { Writer } from "../../core/writer.js";
import { gettextLanguage, pluralForms } from "./plurals.js";
import { encodePoString, type PoEntry, parsePo } from "./syntax.js";

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Writes the translations in the msgstr of each entry; comments, references, contexts and msgid stay byte for byte.
 *
 * - Plural entries get as many msgstr[n] as the target language has forms: the singular text in the form used for
 *   one, the plural text in the others. A language that has more than two forms (Russian, Polish) thus repeats the
 *   plural text, which a human may refine.
 * - The header gets the Language, the Plural-Forms of the target language and charset=UTF-8 (the output is UTF-8).
 *   A catalog without a header gets one: without it, gettext reads the accents as ASCII.
 * - A translated entry loses its fuzzy flag and its previous text (#|): gettext would ignore a fuzzy translation.
 * - An untranslated entry gets an empty msgstr, so that programs show the source text, or is left out with omit.
 *
 * gettext has no escape for non-ASCII characters, so asciiOnly has no effect.
 */
export const poWriter: Writer = {
  format: "po",
  write({ file, content, translate, options, languages }) {
    const text = stripBom(content); // the offsets of parsePo are relative to the text without BOM
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const rule = pluralForms(languages.target);
    const edits: Edit[] = [];
    let translated = 0;
    let untranslated = 0;
    let hasHeader = false;

    for (const entry of parsePo(file, text)) {
      if (entry.id === "") {
        if (entry.context !== undefined) continue; // nothing to translate
        hasHeader = true;
        const value = updateHeader(entry.translations[0]?.value ?? "", languages.target);
        edits.push(...dropFuzzy(text, entry), block(entry, encodePoString("msgstr", value, eol)));
        continue;
      }

      const singular = translate(entry.id);
      const plural = entry.plural === undefined ? undefined : entry.plural === "" ? singular : translate(entry.plural);
      const texts = entry.plural === undefined ? 1 : 2;
      const complete = singular !== undefined && (entry.plural === undefined || plural !== undefined);

      if (complete) {
        translated += texts;
        edits.push(...dropFuzzy(text, entry), block(entry, msgstr(entry, singular, plural ?? singular, rule, eol)));
      } else {
        untranslated += texts;
        if (options.untranslated === "omit") edits.push({ start: entry.start, end: afterEntry(text, entry), text: "" });
        else edits.push(block(entry, msgstr(entry, "", "", rule, eol)));
      }
    }

    let output = "";
    let copied = 0;
    for (const edit of edits.sort((a, b) => a.start - b.start)) {
      output += text.slice(copied, edit.start) + edit.text;
      copied = edit.end;
    }
    output += text.slice(copied);
    if (!hasHeader) {
      const value = updateHeader("", languages.target);
      output = `msgid ""${eol}${encodePoString("msgstr", value, eol)}${eol}${eol}${output}`;
    }
    return { content: output, translated, untranslated };
  },
};

/** Replaces the msgstr lines of an entry. */
function block(entry: PoEntry, text: string): Edit {
  return { start: entry.translationStart, end: entry.translationEnd, text };
}

/** The msgstr of an entry, or the msgstr[n] of a plural entry, in the forms of the target language. */
function msgstr(
  entry: PoEntry,
  singular: string,
  plural: string,
  rule: ReturnType<typeof pluralForms>,
  eol: string,
): string {
  if (entry.plural === undefined) return encodePoString("msgstr", singular, eol);
  const count = rule?.count ?? Math.max(entry.translations.length, 2);
  const one = rule === undefined ? 0 : rule.one;
  return Array.from({ length: count }, (_, index) =>
    encodePoString(`msgstr[${index}]`, index === one ? singular : plural, eol),
  ).join(eol);
}

/** Removes "fuzzy" from the flags of an entry, and its previous text (#|), which only goes with fuzzy. */
function dropFuzzy(text: string, entry: PoEntry): Edit[] {
  if (!entry.flags.includes("fuzzy")) return [];
  const edits: Edit[] = [];
  for (const line of entry.commentLines) {
    if (line.kind === "|") {
      edits.push({ start: line.start, end: line.next, text: "" });
      continue;
    }
    if (line.kind !== ",") continue;
    const raw = text.slice(line.start, line.next);
    const lineEnd = /\r?\n$/.exec(raw)?.[0] ?? "";
    const flags = raw
      .trim()
      .slice(2)
      .split(",")
      .map((flag) => flag.trim())
      .filter((flag) => flag !== "");
    if (!flags.includes("fuzzy")) continue;
    const kept = flags.filter((flag) => flag !== "fuzzy");
    edits.push({ start: line.start, end: line.next, text: kept.length === 0 ? "" : `#, ${kept.join(", ")}${lineEnd}` });
  }
  return edits;
}

/** The end of an entry left out: its last line end, and the blank line after it. */
function afterEntry(text: string, entry: PoEntry): number {
  const newline = text.indexOf("\n", entry.end);
  const end = newline === -1 ? text.length : newline + 1;
  const blank = /^[ \t]*\r?\n/.exec(text.slice(end));
  return end + (blank?.[0].length ?? 0);
}

/** The header with the target language: Language, Plural-Forms when known, and charset=UTF-8. */
function updateHeader(value: string, target: string): string {
  const fields = value.split("\n").filter((field) => field !== "");
  const set = (name: string, update: (current: string | undefined) => string) => {
    const index = fields.findIndex((field) => field.toLowerCase().startsWith(`${name.toLowerCase()}:`));
    const current = index === -1 ? undefined : fields[index]?.slice(name.length + 1).trim();
    const field = `${name}: ${update(current)}`;
    if (index === -1) fields.push(field);
    else fields[index] = field;
  };
  set("Content-Type", (current) =>
    current === undefined || !/charset=/i.test(current)
      ? "text/plain; charset=UTF-8"
      : current.replace(/charset=[^;\s]*/i, "charset=UTF-8"),
  );
  set("Language", () => gettextLanguage(target));
  const rule = pluralForms(target);
  if (rule !== undefined) set("Plural-Forms", () => `nplurals=${rule.count}; plural=${rule.expression};`);
  return fields.map((field) => `${field}\n`).join("");
}
