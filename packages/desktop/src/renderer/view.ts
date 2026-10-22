import type { EngineType, EntryState, EntryView } from "../shared/bridge.js";

/** How the page shows the data of the library: pure functions, without the page (tested in Node.js). */

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  json: "JSON",
  yaml: "YAML",
  markdown: "Markdown",
  html: "HTML",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  odt: "OpenDocument",
  lua: "Lua",
  po: "gettext",
  xliff: "XLIFF",
  android: "Android",
  "ios-strings": "Apple .strings",
  xcstrings: "Catalogue Xcode",
  properties: "Java .properties",
  resx: ".NET .resx",
  arb: "Flutter .arb",
  srt: "Sous-titres SRT",
  vtt: "Sous-titres WebVTT",
  renpy: "Ren'Py",
  "zomboid-txt": "Project Zomboid",
  "paradox-yml": "Paradox",
  "rimworld-xml": "RimWorld",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

const ENGINE_LABELS: Readonly<Record<EngineType, string>> = {
  ollama: "Ollama",
  deepl: "DeepL",
  gemini: "Gemini",
  anthropic: "Claude",
  "openai-compatible": "API compatible OpenAI",
};

export function engineLabel(engine: EngineType): string {
  return ENGINE_LABELS[engine];
}

function displayName(locale: string, code: string): string | undefined {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code);
  } catch {
    return undefined; // not a language code
  }
}

/** "de" → "allemand". */
export function languageLabel(code: string): string {
  return displayName("fr", code) ?? code;
}

/** The output path of a source for one language, as the library fills it ({dir} and {name} stay per file). */
export function outputFor(pattern: string, language: string): string {
  const english = (displayName("en", language) ?? language).toLowerCase();
  return pattern
    .replaceAll("{lang}", language)
    .replaceAll("{LANG}", language.toUpperCase())
    .replaceAll("{language}", english);
}

const numbers = new Intl.NumberFormat("fr-FR");

export function count(value: number): string {
  return numbers.format(value);
}

/** "0 texte", "1 texte", "2 textes": in French, 0 and 1 take the singular. */
export function plural(value: number, one: string, many = `${one}s`): string {
  return `${count(value)} ${value > 1 ? many : one}`;
}

/** The time left, rounded as a person would say it. */
export function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 60) return `environ ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `environ ${hours} h` : `environ ${hours} h ${String(rest).padStart(2, "0")}`;
}

/** Ollama lists "mistral-small:latest" for a model configured as "mistral-small". */
export function installedModel(model: string, installed: readonly string[]): boolean {
  return installed.includes(model) || installed.includes(`${model}:latest`);
}

export type EntryFilter = "all" | EntryState;

export function filterEntries(entries: readonly EntryView[], filter: EntryFilter, query: string): EntryView[] {
  const search = query.trim().toLocaleLowerCase();
  return entries.filter(
    (entry) =>
      (filter === "all" || entry.state === filter) &&
      (search === "" ||
        entry.source.toLocaleLowerCase().includes(search) ||
        (entry.target ?? "").toLocaleLowerCase().includes(search)),
  );
}

export function countByState(entries: readonly EntryView[]): Record<EntryFilter, number> {
  const counts: Record<EntryFilter, number> = { all: entries.length, failed: 0, machine: 0, reviewed: 0, pending: 0 };
  for (const entry of entries) counts[entry.state]++;
  return counts;
}
