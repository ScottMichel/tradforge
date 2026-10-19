import type { TranslationItem, TranslationRequest } from "../../core/provider.js";

/** The answer format, shown to the model. Must match RESPONSE_SCHEMA and parseTranslations. */
export const RESPONSE_EXAMPLE = '{"translations":[{"id":0,"translation":"..."}]}';

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

/** "fr" → "French". Models follow a language name better than a code. */
export function languageName(code: string): string {
  try {
    return displayNames.of(code) ?? code;
  } catch {
    return code; // not a valid language tag: keep it as written
  }
}

/** The instructions sent once per batch. They repeat, in words, the rules the validation enforces. */
export function buildSystemPrompt(request: TranslationRequest): string {
  const from = languageName(request.sourceLanguage);
  const to = languageName(request.targetLanguage);
  const lines = [
    `You are a professional translator for games and applications. Translate each text from ${from} to ${to}.`,
    "",
    "Rules:",
    `- Translate every text completely and naturally. Keep a word in ${from} only if it is a proper noun.`,
    "- Keep every placeholder exactly as written: {name}, {0}, %s, %d, %1$s, %%, and tags such as <b>, </b> or <LINE>.",
    "- Never add a placeholder or a tag that is not in the source, and never turn an ordinary word into one.",
    "- Keep line breaks, leading and trailing spaces, and action markers such as *sighs*.",
    "- Keep a length comparable to the source. Do not add explanations, notes or quotes.",
    "- When a context is given, use it to choose the right meaning. Never translate the context itself.",
  ];

  if (request.instructions !== undefined) {
    lines.push("", "Project instructions:", request.instructions);
  }

  const glossary = usedGlossary(request);
  if (glossary.length > 0) {
    lines.push(
      "",
      "Glossary (always use these translations):",
      ...glossary.map(([term, target]) => `- ${term} → ${target}`),
    );
  }

  lines.push("", `Answer only with JSON in this form, with one entry per text id: ${RESPONSE_EXAMPLE}`);
  return lines.join("\n");
}

/** The texts to translate, as JSON: escapes keep line breaks and quotes unambiguous. */
export function buildUserMessage(items: readonly TranslationItem[]): string {
  return JSON.stringify({
    texts: items.map((item) => ({
      id: item.id,
      text: item.source,
      ...(item.context !== undefined ? { context: item.context } : {}),
    })),
  });
}

/** Only the glossary terms that appear in this batch: a shorter prompt, and less to confuse the model. */
function usedGlossary(request: TranslationRequest): [string, string][] {
  const sources = request.items.map((item) => item.source.toLowerCase());
  return Object.entries(request.glossary ?? {}).filter(([term]) =>
    sources.some((source) => source.includes(term.toLowerCase())),
  );
}
