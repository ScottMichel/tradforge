export const VERSION = "0.1.0";

export { groupOccurrences } from "./core/segments.js";
export type { Occurrence, Segment, SourceLocation, TranslationEntry, TranslationStatus } from "./core/types.js";

export {
  ConfigError,
  DEFAULT_OUTPUT,
  OUTPUT_PLACEHOLDERS,
  parseConfig,
  PROVIDER_TYPES,
  SOURCE_FORMATS,
  UNTRANSLATED_MODES,
} from "./core/config.js";
export type {
  ConfigProblem,
  OutputConfig,
  ProviderConfig,
  ProviderType,
  SourceConfig,
  SourceFormat,
  TradforgeConfig,
  TranslationConfig,
  UntranslatedMode,
  ValidationConfig,
} from "./core/config.js";

export { TranslationMemory } from "./core/memory.js";
export type { ImportOutcome, MemoryLanguages, MemoryOptions, MemoryStats, RecordOutcome } from "./core/memory.js";
export type { FailedTranslation } from "./core/types.js";
export { loadMemory, MemoryFileError, saveMemory } from "./storage/memory-store.js";
export { CsvError } from "./storage/csv.js";
export { exportReviewCsv, importReviewCsv } from "./storage/review.js";
export type { ImportResult, ReviewStatus } from "./storage/review.js";

export { translateSegments } from "./core/pipeline.js";
export type { PipelineConfig, PipelineOptions, PipelineSummary, ProgressEvent } from "./core/pipeline.js";
export { extractOccurrences, extractSegments } from "./formats/extract.js";
export { READERS } from "./formats/readers.js";
export type { Writer, WriterInput, WriterOutput } from "./core/writer.js";
export { WRITERS } from "./formats/writers.js";
export { jsonWriter } from "./formats/json/writer.js";
export { luaWriter } from "./formats/lua/writer.js";
export { buildProject } from "./formats/build.js";
export type { BuildOptions, BuiltFile } from "./formats/build.js";
export { listProjectFiles, OutputError, outputPath } from "./formats/project.js";
export type { ProjectFile } from "./formats/project.js";

export { BatchError, ProviderUnavailableError } from "./core/provider.js";
export type { Provider, TranslationItem, TranslationRequest } from "./core/provider.js";
export { createProvider } from "./providers/factory.js";
export { createOllamaProvider } from "./providers/ollama/provider.js";
export type { OllamaOptions } from "./providers/ollama/provider.js";
export { createMockProvider } from "./providers/mock/provider.js";
export type { MockOptions, MockProvider } from "./providers/mock/provider.js";

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
