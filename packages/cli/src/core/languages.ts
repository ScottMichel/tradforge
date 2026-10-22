const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

/** "fr" → "French". Models follow a language name better than a code, and folders are sometimes named after it. */
export function languageName(code: string): string {
  try {
    return displayNames.of(code) ?? code;
  } catch {
    return code; // not a valid language tag: keep it as written
  }
}
