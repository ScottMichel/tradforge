import { ConfigError, type ConfigProblem, parseString, type Report } from "./config/parse.js";
import { type ProviderConfig, parseProvider } from "./config/providers.js";
import { parseSources, type SourceConfig } from "./config/sources.js";
import { parseTranslation, type TranslationConfig } from "./config/translation.js";
import { parseValidation, type ValidationConfig } from "./config/validation.js";
import { isObject } from "./json.js";

/**
 * The configuration of a project (tradforge.config.json), parsed into a complete, typed value. Each part has its
 * module in config/: the sources and their formats, the engine, the translation settings, the validation.
 */

export type { ConfigProblem } from "./config/parse.js";
export { ConfigError } from "./config/parse.js";
export * from "./config/providers.js";
export * from "./config/sources.js";
export * from "./config/translation.js";
export * from "./config/validation.js";

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

const DEFAULT_WORK_DIR = ".tradforge";

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
