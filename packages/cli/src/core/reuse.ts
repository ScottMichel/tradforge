/** Spaces, punctuation and symbols at the start or the end of a text. */
const LEADING = /^[\s\p{P}\p{S}]+/u;
const TRAILING = /[\s\p{P}\p{S}]+$/u;

/**
 * Reuses the translation of a text whose words did not change, only the punctuation or spaces around them:
 * "Quit game" → "Quit game." makes "Quitter le jeu" → "Quitter le jeu.". Returns undefined when the words changed:
 * then the model has to translate, with the old translation as a hint.
 */
export function reuseTranslation(from: string, to: string, translation: string): string | undefined {
  const core = coreOf(to);
  if (core === "" || core !== coreOf(from)) return undefined;

  // An edge of the translation is replaced only if the old source had something there: that something is what
  // the translation's edge translates. Otherwise the edge belongs to the translation itself ("¡Sí") and stays.
  let body = translation;
  if (leading(from) !== "") body = body.replace(LEADING, "");
  if (trailing(from) !== "") body = body.replace(TRAILING, "");
  if (body.trim() === "") return undefined;
  return leading(to) + body + trailing(to);
}

function coreOf(text: string): string {
  return text.replace(LEADING, "").replace(TRAILING, "");
}

function leading(text: string): string {
  return LEADING.exec(text)?.[0] ?? "";
}

function trailing(text: string): string {
  return TRAILING.exec(text)?.[0] ?? "";
}
