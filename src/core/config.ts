import { INPUT_ENCODINGS, type InputEncoding, TEXT_ENCODINGS, type TextEncoding } from "./encodings.js";
import { isObject } from "./json.js";
import {
  DEFAULT_PLACEHOLDER_SYNTAXES,
  PLACEHOLDER_SYNTAXES,
  type PlaceholderSyntax,
} from "./validation/placeholders.js";

/** Every format a reader exists for. Single source of truth for validation and types. */
export const SOURCE_FORMATS = [
  "json",
  "lua",
  "paradox-yml",
  "renpy",
  "rimworld-xml",
  "srt",
  "vtt",
  "zomboid-txt",
] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export const PROVIDER_TYPES = ["ollama", "openai-compatible"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

/**
 * How an OpenAI-compatible server is asked for JSON. json-schema: the answer must follow our schema (OpenAI,
 * Mistral, OpenRouter, LM Studio, vLLM). json-object: any JSON (older servers). none: the prompt alone asks for it.
 */
export const RESPONSE_FORMATS = ["json-schema", "json-object", "none"] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

/** What to do with a text that has no translation: keep the source text, or leave it out (JSON keys only). */
export const UNTRANSLATED_MODES = ["keep-source", "omit"] as const;
export type UntranslatedMode = (typeof UNTRANSLATED_MODES)[number];

/** Placeholders of an output path template, e.g. "locales/{lang}/{name}{ext}". */
export const OUTPUT_PLACEHOLDERS = ["dir", "name", "stem", "ext", "lang", "LANG", "language"] as const;

export interface OutputConfig {
  /** Path of the translated file, relative to the project root. {dir}, {name} and {ext} come from the source file. */
  readonly path: string;
  /** Escape every non-ASCII character, for games that read UTF-8 badly. */
  readonly asciiOnly: boolean;
  readonly untranslated: UntranslatedMode;
  /** Encoding of the translated files: a game may expect a legacy code page such as windows-1252. */
  readonly encoding: TextEncoding;
}

/** Next to the source file: locales/en/ui.json → locales/en/ui.fr.json. Never overwrites the source. */
export const DEFAULT_OUTPUT: OutputConfig = {
  path: "{dir}/{name}.{lang}{ext}",
  asciiOnly: false,
  untranslated: "keep-source",
  encoding: "utf-8",
};

/**
 * How texts are grouped into conversations, kept in one batch whenever possible.
 * auto: the reader decides (same JSON object, Lua lines with no blank line between them).
 * none: no groups. file: one group per file. keyPattern: texts whose keys give the same first capture group.
 */
export type GroupRule = "auto" | "none" | "file" | { readonly keyPattern: string };

export const GROUP_MODES = ["auto", "none", "file"] as const;

export interface SourceConfig {
  readonly format: SourceFormat;
  /** Glob patterns, relative to the project root. */
  readonly include: readonly string[];
  /** Lower value = translated first. May be negative. */
  readonly priority: number;
  /** Hint for the translator about how these texts are used. */
  readonly context?: string;
  readonly group: GroupRule;
  /** Encoding of the source files. auto: byte order mark, then valid UTF-8, then windows-1252. */
  readonly encoding: InputEncoding;
  /** Where and how to write the translated files. */
  readonly output: OutputConfig;
}

/** A local model served by Ollama. */
export interface OllamaProviderConfig {
  readonly type: "ollama";
  readonly model: string;
  readonly host: string;
}

/** Any server that speaks the OpenAI chat completions protocol: OpenAI, Mistral, OpenRouter, Groq, LM Studio, vLLM... */
export interface OpenAiCompatibleProviderConfig {
  readonly type: "openai-compatible";
  readonly model: string;
  /** e.g. https://api.openai.com/v1, http://localhost:1234/v1 */
  readonly baseUrl: string;
  /** Name of the environment variable that holds the API key. The key itself never goes in the configuration. */
  readonly apiKeyEnv: string;
  readonly responseFormat: ResponseFormat;
}

/** Discriminated by type: each engine has its own settings. */
export type ProviderConfig = OllamaProviderConfig | OpenAiCompatibleProviderConfig;

export interface TranslationConfig {
  /** Number of segments sent to the model in one request. */
  readonly batchSize: number;
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

export interface ValidationConfig {
  /** Placeholder syntaxes that translations must preserve. Empty disables the check. */
  readonly placeholders: readonly PlaceholderSyntax[];
  /** Reject a translation that does not use the glossary translation of a term found in the source. */
  readonly glossary: boolean;
}

export interface TradforgeConfig {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  /** Folder for the translation memory and other working files. */
  readonly workDir: string;
  readonly sources: readonly SourceConfig[];
  readonly provider: ProviderConfig;
  readonly translation: TranslationConfig;
  readonly validation: ValidationConfig;
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
const DEFAULT_PROVIDER: OllamaProviderConfig = {
  type: "ollama",
  model: "mistral-small",
  host: "http://localhost:11434",
};

type Report = (path: string, message: string) => void;

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
    validation: parseValidation(raw.validation, report),
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
    return {
      format: SOURCE_FORMATS[0],
      include: [],
      priority: DEFAULT_PRIORITY,
      group: "auto",
      encoding: "auto",
      output: DEFAULT_OUTPUT,
    };
  }
  // Parsed in field order, so that problems are reported in that order too.
  const format = parseChoice(SOURCE_FORMATS, value.format, `${path}.format`, report);
  const include = parseStringList(value.include, `${path}.include`, report);
  const priority = parseInteger(value.priority, `${path}.priority`, report, DEFAULT_PRIORITY);
  const context = value.context === undefined ? undefined : parseString(value.context, `${path}.context`, report);
  const group = parseGroupRule(value.group, `${path}.group`, report);
  const encoding = parseChoice(INPUT_ENCODINGS, value.encoding, `${path}.encoding`, report, "auto");
  const output = parseOutput(value.output, `${path}.output`, report);
  return { format, include, priority, ...(context !== undefined ? { context } : {}), group, encoding, output };
}

function parseGroupRule(value: unknown, path: string, report: Report): GroupRule {
  if (value === undefined) return "auto";
  if (isObject(value)) {
    const keyPattern = parseString(value.keyPattern, `${path}.keyPattern`, report);
    try {
      new RegExp(keyPattern, "u");
    } catch (error) {
      report(`${path}.keyPattern`, `is not a valid regular expression (${errorMessage(error)})`);
    }
    return { keyPattern };
  }
  const mode = GROUP_MODES.find((m) => m === value);
  if (mode !== undefined) return mode;
  report(path, `must be one of ${GROUP_MODES.join(", ")}, or { "keyPattern": "<regular expression>" }`);
  return "auto";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const TEMPLATE_PLACEHOLDER = /\{([^{}]*)\}/g;
const ABSOLUTE_PATH = /^([a-zA-Z]:)?[\\/]/;

function parseOutput(value: unknown, path: string, report: Report): OutputConfig {
  if (value === undefined) return DEFAULT_OUTPUT;
  if (!isObject(value)) {
    report(path, "must be an object");
    return DEFAULT_OUTPUT;
  }
  const template = parseString(value.path, `${path}.path`, report, DEFAULT_OUTPUT.path);
  checkOutputTemplate(template, `${path}.path`, report);
  const asciiOnly = parseBoolean(value.asciiOnly, `${path}.asciiOnly`, report, DEFAULT_OUTPUT.asciiOnly);
  const untranslated = parseChoice(
    UNTRANSLATED_MODES,
    value.untranslated,
    `${path}.untranslated`,
    report,
    DEFAULT_OUTPUT.untranslated,
  );
  const encoding = parseChoice(TEXT_ENCODINGS, value.encoding, `${path}.encoding`, report, DEFAULT_OUTPUT.encoding);
  return { path: template, asciiOnly, untranslated, encoding };
}

/** Reports the first problem of an output path template: an absolute path, or an unknown placeholder. */
function checkOutputTemplate(template: string, path: string, report: Report): void {
  if (ABSOLUTE_PATH.test(template)) {
    report(path, "must be relative to the project root");
    return;
  }
  const known: readonly string[] = OUTPUT_PLACEHOLDERS;
  for (const [placeholder, name = ""] of template.matchAll(TEMPLATE_PLACEHOLDER)) {
    if (!known.includes(name)) {
      const list = OUTPUT_PLACEHOLDERS.map((p) => `{${p}}`).join(", ");
      report(path, `unknown placeholder ${placeholder} (use ${list})`);
      return;
    }
  }
}

function parseBoolean(value: unknown, path: string, report: Report, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  report(path, "must be true or false");
  return fallback;
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
  const type = parseChoice(PROVIDER_TYPES, value.type, "provider.type", report, DEFAULT_PROVIDER.type);
  switch (type) {
    case "ollama":
      return {
        type,
        model: parseString(value.model, "provider.model", report, DEFAULT_PROVIDER.model),
        host: parseString(value.host, "provider.host", report, DEFAULT_PROVIDER.host),
      };
    case "openai-compatible":
      return parseOpenAiCompatible(value, report);
  }
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_API_KEY_ENV = "OPENAI_API_KEY";
/** The usual shape of an environment variable name, which also works on Windows. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseOpenAiCompatible(value: Record<string, unknown>, report: Report): OpenAiCompatibleProviderConfig {
  const baseUrl = parseString(value.baseUrl, "provider.baseUrl", report, DEFAULT_BASE_URL);
  if (baseUrl !== "" && !/^https?:\/\/[^/]/.test(baseUrl)) {
    report("provider.baseUrl", "must start with http:// or https://");
  }
  const apiKeyEnv = parseString(value.apiKeyEnv, "provider.apiKeyEnv", report, DEFAULT_API_KEY_ENV);
  if (apiKeyEnv !== "" && !ENV_NAME.test(apiKeyEnv)) {
    report("provider.apiKeyEnv", "must be the name of an environment variable, such as OPENAI_API_KEY");
  }
  if (value.apiKey !== undefined) {
    // The configuration file is often committed: a key written there ends up public. Never echo it back.
    report(
      "provider.apiKey",
      `never write an API key in the configuration: put it in the ${apiKeyEnv || DEFAULT_API_KEY_ENV} environment variable`,
    );
  }
  return {
    type: "openai-compatible",
    model: parseString(value.model, "provider.model", report),
    baseUrl,
    apiKeyEnv,
    responseFormat: parseChoice(
      RESPONSE_FORMATS,
      value.responseFormat,
      "provider.responseFormat",
      report,
      "json-schema",
    ),
  };
}

const DEFAULT_TRANSLATION: TranslationConfig = {
  batchSize: DEFAULT_BATCH_SIZE,
  glossary: {},
  contextLines: 3,
  typography: true,
  reuse: true,
};

function parseTranslation(value: unknown, report: Report): TranslationConfig {
  if (value === undefined) return { ...DEFAULT_TRANSLATION, glossary: {} };
  if (!isObject(value)) {
    report("translation", "must be an object");
    return { ...DEFAULT_TRANSLATION, glossary: {} };
  }
  const batchSize = parseInteger(value.batchSize, "translation.batchSize", report, DEFAULT_BATCH_SIZE, 1);
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
    ...(instructions !== undefined ? { instructions } : {}),
    glossary,
    contextLines,
    typography,
    reuse,
  };
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

function parseValidation(value: unknown, report: Report): ValidationConfig {
  if (value === undefined) return { placeholders: [...DEFAULT_PLACEHOLDER_SYNTAXES], glossary: true };
  if (!isObject(value)) {
    report("validation", "must be an object");
    return { placeholders: [], glossary: true };
  }
  const placeholders = parsePlaceholderSyntaxes(value.placeholders, report);
  const glossary = parseBoolean(value.glossary, "validation.glossary", report, true);
  return { placeholders, glossary };
}

function parsePlaceholderSyntaxes(value: unknown, report: Report): PlaceholderSyntax[] {
  if (value === undefined) return [...DEFAULT_PLACEHOLDER_SYNTAXES];
  if (!Array.isArray(value)) {
    report("validation.placeholders", `must be an array of ${PLACEHOLDER_SYNTAXES.join(", ")}`);
    return [];
  }
  return value.map((syntax: unknown, index) =>
    parseChoice(PLACEHOLDER_SYNTAXES, syntax, `validation.placeholders[${index}]`, report),
  );
}

/** Placeholder syntaxes that a format brings with it, on top of the configured ones. */
export const FORMAT_PLACEHOLDERS: Readonly<Partial<Record<SourceFormat, readonly PlaceholderSyntax[]>>> = {
  "paradox-yml": ["paradox"],
  renpy: ["renpy", "printf"],
  "rimworld-xml": ["rimworld"],
};

/** The placeholder syntaxes to check: the configured ones, plus those of the formats the project uses. */
export function effectivePlaceholders(config: Pick<TradforgeConfig, "sources" | "validation">): PlaceholderSyntax[] {
  const syntaxes = new Set(config.validation.placeholders);
  for (const source of config.sources)
    for (const syntax of FORMAT_PLACEHOLDERS[source.format] ?? []) syntaxes.add(syntax);
  return [...syntaxes];
}
