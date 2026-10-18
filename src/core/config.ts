/** Every format a reader exists for. Single source of truth for validation and types. */
export const SOURCE_FORMATS = ["json", "lua"] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export const PROVIDER_TYPES = ["ollama"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface SourceConfig {
  readonly format: SourceFormat;
  /** Glob patterns, relative to the project root. */
  readonly include: readonly string[];
  /** Lower value = translated first. May be negative. */
  readonly priority: number;
  /** Hint for the translator about how these texts are used. */
  readonly context?: string;
}

export interface ProviderConfig {
  readonly type: ProviderType;
  readonly model: string;
  readonly host: string;
}

export interface TranslationConfig {
  /** Number of segments sent to the model in one request. */
  readonly batchSize: number;
  /** Extra instructions for the model (tone, audience...). */
  readonly instructions?: string;
  /** Terms that must always be translated the same way. */
  readonly glossary: Readonly<Record<string, string>>;
}

export interface TradforgeConfig {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  /** Folder for the translation memory and other working files. */
  readonly workDir: string;
  readonly sources: readonly SourceConfig[];
  readonly provider: ProviderConfig;
  readonly translation: TranslationConfig;
}

export interface ConfigProblem {
  /** Where the problem is, e.g. "sources[0].format". */
  readonly path: string;
  readonly message: string;
}

/** Thrown by parseConfig, with every problem found in the configuration. */
export class ConfigError extends Error {
  readonly problems: readonly ConfigProblem[];

  constructor(problems: readonly ConfigProblem[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p.path}: ${p.message}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

const DEFAULT_WORK_DIR = ".tradforge";
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_PRIORITY = 0;
const DEFAULT_PROVIDER: ProviderConfig = {
  type: "ollama",
  model: "mistral-small",
  host: "http://localhost:11434",
};

type JsonObject = Readonly<Record<string, unknown>>;
type Report = (path: string, message: string) => void;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Turns untrusted JSON into a complete, typed configuration, or throws a ConfigError. */
export function parseConfig(raw: unknown): TradforgeConfig {
  if (!isObject(raw)) {
    throw new ConfigError([{ path: "(root)", message: "must be a JSON object" }]);
  }

  const problems: ConfigProblem[] = [];
  const report: Report = (path, message) => {
    problems.push({ path, message });
  };

  // Placeholders returned for invalid fields never escape: we throw below.
  const config: TradforgeConfig = {
    sourceLanguage: parseString(raw.sourceLanguage, "sourceLanguage", report),
    targetLanguage: parseString(raw.targetLanguage, "targetLanguage", report),
    workDir: parseString(raw.workDir, "workDir", report, DEFAULT_WORK_DIR),
    sources: parseSources(raw.sources, report),
    provider: parseProvider(raw.provider, report),
    translation: parseTranslation(raw.translation, report),
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

function parseString(value: unknown, path: string, report: Report, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (isNonEmptyString(value)) return value;
  report(path, value === undefined ? "is required" : "must be a non-empty string");
  return "";
}

function parseChoice<T extends string>(
  choices: readonly [T, ...T[]],
  value: unknown,
  path: string,
  report: Report,
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) return fallback;
  const choice = choices.find((c) => c === value);
  if (choice !== undefined) return choice;
  report(path, `must be one of ${choices.join(", ")}`);
  return choices[0];
}

function parseSources(value: unknown, report: Report): SourceConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    report("sources", "must be a non-empty array");
    return [];
  }
  return value.map((source: unknown, index) => parseSource(source, `sources[${index}]`, report));
}

function parseSource(value: unknown, path: string, report: Report): SourceConfig {
  if (!isObject(value)) {
    report(path, "must be an object");
    return { format: SOURCE_FORMATS[0], include: [], priority: DEFAULT_PRIORITY };
  }
  // Parsed in field order, so that problems are reported in that order too.
  const format = parseChoice(SOURCE_FORMATS, value.format, `${path}.format`, report);
  const include = parseStringList(value.include, `${path}.include`, report);
  const priority = parseInteger(value.priority, `${path}.priority`, report, DEFAULT_PRIORITY);
  const context =
    value.context === undefined ? undefined : parseString(value.context, `${path}.context`, report);
  return { format, include, priority, ...(context !== undefined ? { context } : {}) };
}

function parseStringList(value: unknown, path: string, report: Report): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    report(path, "must be a non-empty array of strings");
    return [];
  }
  value.forEach((item: unknown, index) => {
    if (!isNonEmptyString(item)) report(`${path}[${index}]`, "must be a non-empty string");
  });
  return value.filter(isNonEmptyString);
}

function parseProvider(value: unknown, report: Report): ProviderConfig {
  if (value === undefined) return DEFAULT_PROVIDER;
  if (!isObject(value)) {
    report("provider", "must be an object");
    return DEFAULT_PROVIDER;
  }
  return {
    type: parseChoice(PROVIDER_TYPES, value.type, "provider.type", report, DEFAULT_PROVIDER.type),
    model: parseString(value.model, "provider.model", report, DEFAULT_PROVIDER.model),
    host: parseString(value.host, "provider.host", report, DEFAULT_PROVIDER.host),
  };
}

function parseTranslation(value: unknown, report: Report): TranslationConfig {
  if (value === undefined) return { batchSize: DEFAULT_BATCH_SIZE, glossary: {} };
  if (!isObject(value)) {
    report("translation", "must be an object");
    return { batchSize: DEFAULT_BATCH_SIZE, glossary: {} };
  }
  const batchSize = parseInteger(value.batchSize, "translation.batchSize", report, DEFAULT_BATCH_SIZE, 1);
  const instructions =
    value.instructions === undefined
      ? undefined
      : parseString(value.instructions, "translation.instructions", report);
  const glossary = parseGlossary(value.glossary, report);
  return { batchSize, ...(instructions !== undefined ? { instructions } : {}), glossary };
}

function parseInteger(value: unknown, path: string, report: Report, fallback: number, min?: number): number {
  if (value === undefined) return fallback;
  const valid = typeof value === "number" && Number.isInteger(value) && (min === undefined || value >= min);
  if (valid) return value;
  report(path, min === undefined ? "must be an integer" : `must be an integer greater than or equal to ${min}`);
  return fallback;
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
