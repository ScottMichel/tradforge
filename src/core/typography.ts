/** U+00A0. Game fonts often lack the narrow U+202F, so the common non-breaking space is the safe choice. */
const NBSP = "\u{a0}";
const SPACES = "[ \\u{a0}\\u{202f}]*";

/** Placeholders, tags and URLs: their punctuation must never be touched. */
const PROTECTED = /https?:\/\/\S+|\{[^{}\s]*\}|%(?:\d+\$)?[-+#0]*\d*(?:\.\d+)?[a-zA-Z%]|<[^<>]*>/g;
/** Private use characters stand for the protected parts while the rules run. */
const PRIVATE_USE = /[\u{e000}-\u{f8ff}]/u;
const FIRST_PRIVATE_USE = 0xe000;

interface Rules {
  /** Punctuation that takes a non-breaking space before it (a run like "?!" takes one, before the run). */
  readonly spaceBefore: string;
}

/**
 * Applies the typography rules of the target language, e.g. French non-breaking spaces before ; : ! ? and inside
 * « ». Placeholders, tags, URLs and times (12:30) are left alone. Languages without rules are returned unchanged.
 */
export function fixTypography(text: string, language: string): string {
  const rules = rulesFor(language);
  // A text that already uses private use characters (icon fonts...) is left alone rather than risk mixing them up.
  if (rules === undefined || PRIVATE_USE.test(text)) return text;

  const tokens: string[] = [];
  let result = text.replace(PROTECTED, (token) => {
    tokens.push(token);
    return String.fromCodePoint(FIRST_PRIVATE_USE + tokens.length - 1);
  });

  // A run of punctuation after a non-space character: "Prêt?" → "Prêt ?", "Quoi?!" → "Quoi ?!".
  const before = new RegExp(`([^\\s${rules.spaceBefore}])(${SPACES})([${rules.spaceBefore}]+)`, "gu");
  result = result.replace(
    before,
    (match, previous: string, spaces: string, marks: string, offset: number, all: string) => {
      const next = all.charAt(offset + match.length);
      // A colon glued to what follows is not punctuation: 12:30, {hour}:{minute}, 3:1.
      if (marks.startsWith(":") && next !== "" && !/\s/.test(next)) return match;
      return previous + keepNarrow(spaces) + marks;
    },
  );
  // Inside French quotes.
  result = result.replace(new RegExp(`([^\\s«])${SPACES}»`, "gu"), `$1${NBSP}»`);
  result = result.replace(new RegExp(`«${SPACES}(?=\\S)`, "gu"), `«${NBSP}`);

  return result.replace(
    /[\u{e000}-\u{f8ff}]/gu,
    (char) => tokens[(char.codePointAt(0) ?? 0) - FIRST_PRIVATE_USE] ?? char,
  );
}

/** A narrow non-breaking space already chosen by the translator is kept; anything else becomes NBSP. */
function keepNarrow(spaces: string): string {
  return spaces.includes("\u{202f}") ? "\u{202f}" : NBSP;
}

function rulesFor(language: string): Rules | undefined {
  const tag = language.toLowerCase().replace("_", "-");
  // Canadian French only spaces the colon (and the quotes); France also spaces ; ! and ?.
  if (tag === "fr-ca") return { spaceBefore: ":" };
  if (tag === "fr" || tag.startsWith("fr-")) return { spaceBefore: ";:!?" };
  return undefined;
}
