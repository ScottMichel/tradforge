import { isObject } from "../json.js";
import { isNonEmptyString, parseBoolean, parseInteger, parseString, type Report } from "./parse.js";

export interface TranslationConfig {
  /** Number of segments sent to the model in one request. */
  readonly batchSize: number;
  /**
   * Batches sent at the same time. 1 suits a local model, whose graphics card is already busy; remote APIs spend
   * most of their time waiting for the network and go faster with 4 or 8.
   */
  readonly concurrency: number;
  /** Extra instructions for the model (tone, audience...). */
  readonly instructions?: string;
  /** Terms that must always be translated the same way. */
  readonly glossary: Readonly<Record<string, string>>;
  /** Lines sent before and after each batch, as context only (with their translation when known). 0: none. */
  readonly contextLines: number;
  /** Fix the typography of the target language after translation (French: non-breaking spaces before ; : ! ?). */
  readonly typography: boolean;
  /** Reuse the translation of a slightly changed text: copied when only the punctuation changed, else shown to the model. */
  readonly reuse: boolean;
}

const DEFAULT_BATCH_SIZE = 20;

const DEFAULT_TRANSLATION: TranslationConfig = {
  batchSize: DEFAULT_BATCH_SIZE,
  concurrency: 1,
  glossary: {},
  contextLines: 3,
  typography: true,
  reuse: true,
};

export function parseTranslation(value: unknown, report: Report): TranslationConfig {
  if (value === undefined) return { ...DEFAULT_TRANSLATION, glossary: {} };
  if (!isObject(value)) {
    report("translation", "must be an object");
    return { ...DEFAULT_TRANSLATION, glossary: {} };
  }
  const batchSize = parseInteger(value.batchSize, "translation.batchSize", report, DEFAULT_BATCH_SIZE, 1);
  const concurrency = parseInteger(
    value.concurrency,
    "translation.concurrency",
    report,
    DEFAULT_TRANSLATION.concurrency,
    1,
  );
  const instructions =
    value.instructions === undefined ? undefined : parseString(value.instructions, "translation.instructions", report);
  const glossary = parseGlossary(value.glossary, report);
  const contextLines = parseInteger(
    value.contextLines,
    "translation.contextLines",
    report,
    DEFAULT_TRANSLATION.contextLines,
    0,
  );
  const typography = parseBoolean(value.typography, "translation.typography", report, DEFAULT_TRANSLATION.typography);
  const reuse = parseBoolean(value.reuse, "translation.reuse", report, DEFAULT_TRANSLATION.reuse);
  return {
    batchSize,
    concurrency,
    ...(instructions !== undefined ? { instructions } : {}),
    glossary,
    contextLines,
    typography,
    reuse,
  };
}

function parseGlossary(value: unknown, report: Report): Record<string, string> {
  if (value === undefined) return {};
  if (!isObject(value)) {
    report("translation.glossary", "must be an object mapping terms to translations");
    return {};
  }
  const entries: [string, string][] = [];
  for (const [term, translation] of Object.entries(value)) {
    if (isNonEmptyString(translation)) entries.push([term, translation]);
    else report(`translation.glossary.${term}`, "must be a non-empty string");
  }
  // fromEntries defines own properties, so a "__proto__" term stays a plain entry.
  return Object.fromEntries(entries);
}
