import { type PlaceholderSyntax, removeTokens } from "./validation/placeholders.js";

/**
 * Reasons to look twice at a translation that passed validation. None of them proves a mistake: they choose which
 * translations are worth a back-translation, and a human's time.
 */
export type SuspicionCode = "numbers-changed" | "length" | "negation-lost" | "same-as-source";

export interface Suspicion {
  readonly code: SuspicionCode;
  readonly message: string;
}

export interface SuspicionOptions {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  /** Placeholders are left out: their digits ({level2}, %1$s) are not numbers of the text. */
  readonly syntaxes: readonly PlaceholderSyntax[];
}

/** Below this length, texts vary too much in length between languages to say anything. */
const MIN_LENGTH_CHECKED = 20;
const MIN_RATIO = 0.5;
const MAX_RATIO = 2;

/**
 * A number with its thousands separators (a separator followed by exactly 3 digits: "1,000", "1 000") and its
 * decimals ("1.5", "1,5"). "1, 2" is two numbers.
 */
const NUMBER = /\d+(?:[.,\u{a0}\u{202f} ]\d{3})*(?:[.,]\d+)?/gu;

/**
 * Words that make a sentence negative. A language without a list gets no negation check: better silent than wrong.
 * Each entry is a regular expression source, matched as a whole word, ignoring case.
 */
const NEGATIONS: Readonly<Record<string, readonly string[]>> = {
  en: ["not", "n['’]t", "never", "no", "nobody", "nothing", "none", "nor", "neither", "cannot", "without"],
  fr: ["ne", "n['’]", "pas", "jamais", "aucun", "aucune", "rien", "personne", "sans", "non", "ni", "nul", "nulle"],
  es: ["no", "nunca", "jamás", "nada", "nadie", "ningún", "ninguno", "ninguna", "sin", "ni", "tampoco"],
  de: ["nicht", "kein", "keine", "keinen", "keinem", "keiner", "keines", "nie", "niemals", "nichts", "niemand", "ohne"],
  it: ["non", "mai", "niente", "nulla", "nessuno", "nessuna", "senza", "né"],
  pt: ["não", "nunca", "jamais", "nada", "ninguém", "nenhum", "nenhuma", "sem", "nem"],
};

const negationPatterns = new Map(
  Object.entries(NEGATIONS).map(([language, words]) => [
    language,
    // "n't" and "n'" are glued to the word before or after: only the other side needs a boundary.
    new RegExp(words.map((word) => (word.includes("'") ? word : `(?<!\\p{L})${word}(?!\\p{L})`)).join("|"), "iu"),
  ]),
);

/** Why this translation deserves a second look; empty when nothing stands out. */
export function suspicions(source: string, target: string, options: SuspicionOptions): Suspicion[] {
  const found: Suspicion[] = [];
  const plainSource = removeTokens(source, options.syntaxes);
  const plainTarget = removeTokens(target, options.syntaxes);

  const sourceNumbers = numbers(plainSource);
  const targetNumbers = numbers(plainTarget);
  if (sourceNumbers.join(" ") !== targetNumbers.join(" ")) {
    found.push({
      code: "numbers-changed",
      message: `numbers differ: ${list(sourceNumbers)} in the source, ${list(targetNumbers)} in the translation`,
    });
  }

  const sourceLength = plainSource.trim().length;
  if (sourceLength >= MIN_LENGTH_CHECKED) {
    const ratio = plainTarget.trim().length / sourceLength;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
      found.push({ code: "length", message: `the translation is ${ratio.toFixed(1)} times as long as the source` });
    }
  }

  const sourceNegation = negationPatterns.get(baseLanguage(options.sourceLanguage));
  const targetNegation = negationPatterns.get(baseLanguage(options.targetLanguage));
  if (sourceNegation?.test(plainSource) === true && targetNegation?.test(plainTarget) === false) {
    found.push({ code: "negation-lost", message: "the source is negative, the translation has no negation" });
  }

  if (words(plainSource).length >= 2 && normalize(plainSource) === normalize(plainTarget)) {
    found.push({ code: "same-as-source", message: "the translation is the source text again" });
  }
  return found;
}

/** The digits of each number, sorted: "1,000" and "1 000" are the same number. */
function numbers(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((number) => number.replace(/\D/g, "")).sort();
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function baseLanguage(code: string): string {
  return (code.split(/[-_]/)[0] ?? "").toLowerCase();
}

function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "");
}

function normalize(text: string): string {
  return words(text).join(" ").toLowerCase();
}
