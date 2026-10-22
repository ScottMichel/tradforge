import type { EngineType, EntryState, EntryView } from "../shared/bridge.js";

/**
 * How the page shows the data of the library: pure functions, without the page (tested in Node.js). The words that
 * depend on the language of the interface come from its catalog (i18n/).
 */

/** The names that are translated: the other formats are known by their own name. */
export interface FormatNames {
  readonly xcodeCatalog: string;
  readonly srtSubtitles: string;
  readonly vttSubtitles: string;
}

const FORMAT_LABELS: Readonly<Record<string, string | ((names: FormatNames) => string)>> = {
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
  xcstrings: (names) => names.xcodeCatalog,
  properties: "Java .properties",
  resx: ".NET .resx",
  arb: "Flutter .arb",
  srt: (names) => names.srtSubtitles,
  vtt: (names) => names.vttSubtitles,
  renpy: "Ren'Py",
  "zomboid-txt": "Project Zomboid",
  "paradox-yml": "Paradox",
  "rimworld-xml": "RimWorld",
};

export function formatLabel(format: string, names: FormatNames): string {
  const label = FORMAT_LABELS[format] ?? format;
  return typeof label === "string" ? label : label(names);
}

const ENGINE_LABELS: Readonly<Record<Exclude<EngineType, "openai-compatible">, string>> = {
  ollama: "Ollama",
  deepl: "DeepL",
  gemini: "Gemini",
  anthropic: "Claude",
};

/** The name of an engine; "OpenAI-compatible API" is translated, the others are brands. */
export function engineLabel(engine: EngineType, openAiCompatible: string): string {
  return engine === "openai-compatible" ? openAiCompatible : ENGINE_LABELS[engine];
}

/** The output path of a source for one language, as the library fills it ({dir} and {name} stay per file). */
export function outputFor(pattern: string, language: string): string {
  let english = language;
  try {
    english = new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? language;
  } catch {
    // Not a language code: kept as it is.
  }
  return pattern
    .replaceAll("{lang}", language)
    .replaceAll("{LANG}", language.toUpperCase())
    .replaceAll("{language}", english.toLowerCase());
}

/** The same file or folder, written with "\" or "/", and without case on Windows ("C:\Mods" and "c:/mods"). */
export function samePath(a: string, b: string): boolean {
  const normal = (value: string) => {
    const slashes = value.replaceAll("\\", "/").replace(/\/+$/, "");
    return /^[A-Za-z]:\//.test(slashes) ? slashes.toLowerCase() : slashes;
  };
  return normal(a) === normal(b);
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
