import { languageName } from "../../../core/languages.js";

/**
 * Language codes → the names Paradox games use in headers ("l_french:") and folders ("localisation/french").
 * Keys are lower case with "-" separators. Paradox only ships Brazilian Portuguese and simplified Chinese.
 */
const PARADOX_LANGUAGES: ReadonlyMap<string, string> = new Map([
  ["en", "english"],
  ["fr", "french"],
  ["de", "german"],
  ["es", "spanish"],
  ["ru", "russian"],
  ["pl", "polish"],
  ["pt", "braz_por"],
  ["pt-br", "braz_por"],
  ["zh", "simp_chinese"],
  ["zh-cn", "simp_chinese"],
  ["zh-sg", "simp_chinese"],
  ["zh-hans", "simp_chinese"],
  ["ja", "japanese"],
  ["ko", "korean"],
  ["tr", "turkish"],
]);

/** Codes whose base language is in the table but which must not use it: traditional Chinese is not simplified. */
const NOT_THE_BASE = /^zh-(?:tw|hk|mo|hant)(?:-|$)/;

/**
 * The Paradox name of a language code: "fr" → "french", "pt-BR" → "braz_por", "zh-CN" → "simp_chinese".
 * A regional code uses its base language ("fr-CA" → "french", "it-IT" → "italian"), except traditional Chinese.
 * Other languages get their English name in lower case, with underscores ("it" → "italian", like the {language}
 * output placeholder; "zh-TW" → "chinese_taiwan"); a code that is not a language tag is kept, each run of characters
 * other than letters becoming one "_".
 */
export function paradoxLanguage(code: string): string {
  const normalized = code.toLowerCase().replaceAll("_", "-");
  const known = PARADOX_LANGUAGES.get(normalized);
  if (known !== undefined) return known;
  const base = normalized.split("-")[0] ?? normalized;
  // Traditional Chinese keeps its region or script: "zh-TW" → "chinese_taiwan", never "simp_chinese".
  const lookup = NOT_THE_BASE.test(normalized) ? normalized : base;
  return PARADOX_LANGUAGES.get(lookup) ?? headerName(languageName(lookup));
}

function headerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_|_$/g, "");
}
