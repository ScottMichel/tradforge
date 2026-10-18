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
} from "./core/config.js";

export { ReadError } from "./core/reader.js";
export type { Reader, ReaderInput } from "./core/reader.js";
export { jsonReader } from "./formats/json/reader.js";
