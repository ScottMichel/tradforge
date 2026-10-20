import { DEFAULT_PLACEHOLDER_SYNTAXES, findTokens, type PlaceholderSyntax, removeTokens } from "./placeholders.js";

export type IssueCode =
  | "empty"
  | "placeholder-missing"
  | "placeholder-invented"
  | "markup-changed"
  | "line-breaks-changed"
  | "markers-changed"
  | "whitespace-changed"
  | "untranslated"
  | "glossary-ignored"
  | "too-long";

export interface ValidationIssue {
  readonly code: IssueCode;
  /** Human-readable explanation, also usable as feedback for the model. */
  readonly message: string;
}

export interface TranslationPair {
  readonly source: string;
  readonly target: string;
}

export interface ValidationOptions {
  /** Placeholder syntaxes to check. */
  readonly placeholders: readonly PlaceholderSyntax[];
  /** A translation longer than source length × ratio + slack is rejected. */
  readonly maxLengthRatio: number;
  readonly maxLengthSlack: number;
  /** An identical translation is only suspicious from this many words. */
  readonly minWordsForUntranslated: number;
  /** A term found in the source (whole word, any case) must appear translated as given. Empty: no check. */
  readonly glossary: Readonly<Record<string, string>>;
}

export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  placeholders: DEFAULT_PLACEHOLDER_SYNTAXES,
  maxLengthRatio: 2.2,
  maxLengthSlack: 25,
  minWordsForUntranslated: 4,
  glossary: {},
};

/** One check. Returns no issue when the translation passes it. */
type Validator = (pair: TranslationPair, options: ValidationOptions) => ValidationIssue[];

/** Checks a translation against its source. An empty list means the translation is accepted. */
export function validateTranslation(
  pair: TranslationPair,
  options: Partial<ValidationOptions> = {},
): ValidationIssue[] {
  if (pair.target.trim() === "" && pair.source.trim() !== "") {
    return [{ code: "empty", message: "the translation is empty" }];
  }
  const settings = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  return VALIDATORS.flatMap((validator) => validator(pair, settings));
}

const checkPlaceholders: Validator = ({ source, target }, { placeholders }) => {
  const syntaxes = placeholders.filter((syntax) => syntax !== "markup");
  const { missing, added } = compareTokens(
    syntaxes.flatMap((syntax) => findTokens(source, syntax)),
    syntaxes.flatMap((syntax) => findTokens(target, syntax)),
  );
  const issues: ValidationIssue[] = [];
  if (missing.length > 0) {
    issues.push({ code: "placeholder-missing", message: `missing from the translation: ${missing.join(", ")}` });
  }
  if (added.length > 0) {
    issues.push({ code: "placeholder-invented", message: `added by the translation: ${added.join(", ")}` });
  }
  return issues;
};

const checkMarkup: Validator = ({ source, target }, { placeholders }) => {
  if (!placeholders.includes("markup")) return [];
  const { missing, added } = compareTokens(findTokens(source, "markup"), findTokens(target, "markup"));
  const differences = [
    ...(missing.length > 0 ? [`missing ${missing.join(", ")}`] : []),
    ...(added.length > 0 ? [`added ${added.join(", ")}`] : []),
  ];
  return differences.length > 0
    ? [{ code: "markup-changed", message: `markup differs: ${differences.join("; ")}` }]
    : [];
};

const checkLineBreaks = sameCount("line-breaks-changed", /\r\n|\r|\n/g, "line breaks");
const checkMarkers = sameCount("markers-changed", /\*/g, "action markers (*)");

const checkWhitespace: Validator = ({ source, target }) => {
  const same = leadingSpace(source) === leadingSpace(target) && trailingSpace(source) === trailingSpace(target);
  return same ? [] : [{ code: "whitespace-changed", message: "leading or trailing spaces differ from the source" }];
};

const WORD = /\p{L}+/gu;

const checkUntranslated: Validator = ({ source, target }, { placeholders, minWordsForUntranslated }) => {
  if (target.trim() !== source.trim()) return [];
  const words = countMatches(removeTokens(source, placeholders), WORD);
  return words >= minWordsForUntranslated
    ? [{ code: "untranslated", message: `the translation is identical to the source (${words} words)` }]
    : [];
};

const checkGlossary: Validator = ({ source, target }, { glossary }) => {
  const lowerTarget = target.toLowerCase();
  // The translation only has to contain the expected term: "PNJs" or "PNJ" both follow "NPC" → "PNJ".
  const ignored = Object.entries(glossary).filter(
    ([term, translation]) => containsWord(source, term) && !lowerTarget.includes(translation.toLowerCase()),
  );
  return ignored.length > 0
    ? [
        {
          code: "glossary-ignored",
          message: `glossary not followed: ${ignored.map(([term, translation]) => `"${term}" → "${translation}"`).join(", ")}`,
        },
      ]
    : [];
};

/** The term as a whole word (letters or digits do not continue it on either side), whatever its case. */
function containsWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

const checkLength: Validator = ({ source, target }, { maxLengthRatio, maxLengthSlack }) => {
  const limit = Math.floor(source.length * maxLengthRatio + maxLengthSlack);
  return target.length > limit
    ? [{ code: "too-long", message: `the translation has ${target.length} characters, the limit is ${limit}` }]
    : [];
};

/** Run in this order, so that issues are always reported in the same order. */
const VALIDATORS: readonly Validator[] = [
  checkPlaceholders,
  checkMarkup,
  checkLineBreaks,
  checkMarkers,
  checkWhitespace,
  checkUntranslated,
  checkGlossary,
  checkLength,
];

/** Builds a validator that requires as many matches of the pattern in the translation as in the source. */
function sameCount(code: IssueCode, pattern: RegExp, what: string): Validator {
  return ({ source, target }) => {
    const expected = countMatches(source, pattern);
    const actual = countMatches(target, pattern);
    return expected === actual
      ? []
      : [{ code, message: `${what}: ${expected} in the source, ${actual} in the translation` }];
  };
}

/**
 * Compares two lists of tokens as multisets: order does not matter, counts do.
 * One balance per token: +1 for each use in the source, -1 for each use in the translation.
 */
function compareTokens(source: readonly string[], target: readonly string[]): { missing: string[]; added: string[] } {
  const balance = new Map<string, number>();
  for (const token of source) balance.set(token, (balance.get(token) ?? 0) + 1);
  for (const token of target) balance.set(token, (balance.get(token) ?? 0) - 1);
  const entries = [...balance];
  return {
    missing: entries.filter(([, count]) => count > 0).map(([token]) => token),
    added: entries.filter(([, count]) => count < 0).map(([token]) => token),
  };
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function leadingSpace(text: string): string {
  return text.slice(0, text.length - text.trimStart().length);
}

function trailingSpace(text: string): string {
  return text.slice(text.trimEnd().length);
}
