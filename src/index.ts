export const VERSION = "0.1.0";

export { groupOccurrences } from "./core/segments.js";
export type { Occurrence, Segment, SourceLocation, TranslationEntry, TranslationStatus } from "./core/types.js";

export { ConfigError, parseConfig, PROVIDER_TYPES, SOURCE_FORMATS } from "./core/config.js";
export type {
  ConfigProblem,
  ProviderConfig,
  ProviderType,
  SourceConfig,
  SourceFormat,
  TradforgeConfig,
  TranslationConfig,
  ValidationConfig,
} from "./core/config.js";

export { PLACEHOLDER_SYNTAXES } from "./core/validation/placeholders.js";
export type { PlaceholderSyntax } from "./core/validation/placeholders.js";
export { DEFAULT_VALIDATION_OPTIONS, validateTranslation } from "./core/validation/validate.js";
export type {
  IssueCode,
  TranslationPair,
  ValidationIssue,
  ValidationOptions,
} from "./core/validation/validate.js";

export { ReadError } from "./core/reader.js";
export type { Reader, ReaderInput } from "./core/reader.js";
export { jsonReader } from "./formats/json/reader.js";
export { luaReader } from "./formats/lua/reader.js";
