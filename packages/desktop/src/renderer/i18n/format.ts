/**
 * Numbers, plurals and language names in the language of the interface, through Intl: each language has its own
 * rules (French says "0 fichier", English "0 files"). No page access here, so the catalogs can be tested in Node.js.
 */

let locale = "en";

export function setLocale(code: string): void {
  locale = code;
}

export function currentLocale(): string {
  return locale;
}

export function number(value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** "1 file", "2 files": the number, then the form its plural category takes in the language. */
export function forms(value: number, one: string, other: string): string {
  return `${number(value)} ${new Intl.PluralRules(locale).select(value) === "one" ? one : other}`;
}

/** "de" → "German", "allemand", "Deutsch"..., or the code itself when it is not a language. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** A time left, rounded as a person says it: minutes below an hour, then hours and minutes. */
export function splitDuration(ms: number): { readonly minutes: number; readonly hours: number; readonly rest: string } {
  const minutes = Math.round(ms / 60_000);
  return { minutes, hours: Math.floor(minutes / 60), rest: String(minutes % 60).padStart(2, "0") };
}
