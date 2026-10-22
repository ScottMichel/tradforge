export type { BenchmarkOptions, Engine, EngineResult } from "./core/benchmark.js";
export { benchmarkEngines } from "./core/benchmark.js";
export type {
  AnthropicProviderConfig,
  CharacterPricing,
  ConfigProblem,
  DeepLFormality,
  DeepLModel,
  DeepLProviderConfig,
  GeminiProviderConfig,
  GroupRule,
  OllamaProviderConfig,
  OpenAiCompatibleProviderConfig,
  OutputConfig,
  Pricing,
  ProviderConfig,
  ProviderType,
  RemoteProviderSettings,
  ResponseFormat,
  SourceConfig,
  SourceFormat,
  TradforgeConfig,
  TranslationConfig,
  UntranslatedMode,
  ValidationConfig,
} from "./core/config.js";
export {
  ConfigError,
  DEEPL_FORMALITIES,
  DEEPL_MODELS,
  DEFAULT_OUTPUT,
  effectivePlaceholders,
  FORMAT_PLACEHOLDERS,
  GROUP_MODES,
  MULTILINGUAL_FORMATS,
  OUTPUT_PLACEHOLDERS,
  PROVIDER_TYPES,
  parseConfig,
  parseProviderConfig,
  RESPONSE_FORMATS,
  SOURCE_FORMATS,
  UNTRANSLATED_MODES,
} from "./core/config.js";
export type { ChangedSource, DiffOptions, SourceDiff } from "./core/diff.js";
export { diffSources, similarity } from "./core/diff.js";
export type { InputEncoding, TextEncoding } from "./core/encodings.js";
export { INPUT_ENCODINGS, TEXT_ENCODINGS } from "./core/encodings.js";
export { groupRule } from "./core/groups.js";
export { languageName } from "./core/languages.js";
export type { ImportOutcome, MemoryLanguages, MemoryOptions, MemoryStats, RecordOutcome } from "./core/memory.js";
export { TranslationMemory } from "./core/memory.js";
export type {
  PipelineConfig,
  PipelineOptions,
  PipelineSummary,
  ProgressEvent,
  RateLimitEvent,
  Selection,
} from "./core/pipeline.js";
export { planRequests, selectSegments, translateSegments } from "./core/pipeline.js";
export type { Protected } from "./core/protection.js";
export { ProtectionError, protectPlaceholders, restorePlaceholders } from "./core/protection.js";
export type {
  ContextLine,
  PreviousTranslation,
  Provider,
  Review,
  ReviewItem,
  ReviewRequest,
  TranslationItem,
  TranslationRequest,
  Verdict,
} from "./core/provider.js";
export {
  BatchError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
  VERDICTS,
} from "./core/provider.js";
export type { BinaryReader, BinaryReaderInput, Reader, ReaderInput } from "./core/reader.js";
export { isBinary, ReadError } from "./core/reader.js";
export { reuseTranslation } from "./core/reuse.js";
export { sampleSegments } from "./core/sample.js";
export { groupOccurrences } from "./core/segments.js";
export type { Suspicion, SuspicionCode, SuspicionOptions } from "./core/suspicion.js";
export { suspicions } from "./core/suspicion.js";
export type {
  FailedTranslation,
  Occurrence,
  Segment,
  SourceLocation,
  TranslationEntry,
  TranslationStatus,
} from "./core/types.js";
export { fixTypography } from "./core/typography.js";
export type { PlaceholderSyntax } from "./core/validation/placeholders.js";
export {
  DEFAULT_PLACEHOLDER_SYNTAXES,
  PLACEHOLDER_SYNTAXES,
  placeholderPattern,
} from "./core/validation/placeholders.js";
export type {
  IssueCode,
  TranslationPair,
  ValidationIssue,
  ValidationOptions,
} from "./core/validation/validate.js";
export { DEFAULT_VALIDATION_OPTIONS, validateTranslation } from "./core/validation/validate.js";
export type { CheckCandidate, Judge, SelectOptions, VerifyOptions, VerifySummary } from "./core/verify.js";
export { selectForCheck, verifyTranslations } from "./core/verify.js";
export type {
  BinaryWriter,
  BinaryWriterInput,
  BinaryWriterOutput,
  Writer,
  WriterInput,
  WriterOutput,
} from "./core/writer.js";
export { androidReader } from "./formats/android/reader.js";
export { androidLanguage, pluralQuantities } from "./formats/android/resources.js";
export { androidWriter } from "./formats/android/writer.js";
export { arbReader, parseArb } from "./formats/arb/reader.js";
export { arbWriter } from "./formats/arb/writer.js";
export type { BuildOptions, BuiltFile } from "./formats/build.js";
export { buildProject } from "./formats/build.js";
export type { DetectedSource, Detection, SkippedFile } from "./formats/detect.js";
export { detectSources, FORMAT_EXTENSIONS, formatOf } from "./formats/detect.js";
export { docxReader } from "./formats/docx/reader.js";
export { docxWriter } from "./formats/docx/writer.js";
export { extractOccurrences, extractSegments } from "./formats/extract.js";
export type { HtmlDocument, HtmlText } from "./formats/html/document.js";
export { decodeEntities, htmlTexts, parseHtml } from "./formats/html/document.js";
export { htmlReader } from "./formats/html/reader.js";
export { htmlWriter } from "./formats/html/writer.js";
export { iosStringsReader } from "./formats/ios/reader.js";
export { encodeIosString, parseIosStrings } from "./formats/ios/strings.js";
export { iosStringsWriter } from "./formats/ios/writer.js";
export { jsonReader } from "./formats/json/reader.js";
export { jsonWriter } from "./formats/json/writer.js";
export { luaReader } from "./formats/lua/reader.js";
export { luaWriter } from "./formats/lua/writer.js";
export type { MarkdownKind, MarkdownText } from "./formats/markdown/blocks.js";
export { markdownTexts } from "./formats/markdown/blocks.js";
export { markdownReader } from "./formats/markdown/reader.js";
export { markdownWriter } from "./formats/markdown/writer.js";
export type { OdtParagraph } from "./formats/odt/paragraphs.js";
export { odtParagraphs, writeOdtParagraph } from "./formats/odt/paragraphs.js";
export { odtParts, odtReader } from "./formats/odt/reader.js";
export { odtWriter } from "./formats/odt/writer.js";
export type { Dialect, Paragraph } from "./formats/office/paragraphs.js";
export {
  DRAWING,
  INLINE_STRING,
  parseParagraphs,
  SPREADSHEET,
  WORD,
  writeParagraph,
} from "./formats/office/paragraphs.js";
export { paradoxLanguage } from "./formats/paradox/languages.js";
export { paradoxReader } from "./formats/paradox/reader.js";
export { paradoxWriter } from "./formats/paradox/writer.js";
export type { PluralForms } from "./formats/po/plurals.js";
export { gettextLanguage, pluralForms } from "./formats/po/plurals.js";
export { poReader } from "./formats/po/reader.js";
export { poWriter } from "./formats/po/writer.js";
export { pptxReader, slideParts } from "./formats/pptx/reader.js";
export { pptxWriter } from "./formats/pptx/writer.js";
export type { OutputLanguages, ProjectFile } from "./formats/project.js";
export { listProjectFiles, OutputError, outputPath } from "./formats/project.js";
export { propertiesReader } from "./formats/properties/reader.js";
export { encodePropertiesValue, isMessageFormat, parseProperties } from "./formats/properties/syntax.js";
export { propertiesWriter } from "./formats/properties/writer.js";
export { pzLanguageCode } from "./formats/pz/languages.js";
export { pzReader } from "./formats/pz/reader.js";
export { pzWriter } from "./formats/pz/writer.js";
export { READERS, readerFor } from "./formats/readers.js";
export { renpyReader } from "./formats/renpy/reader.js";
export { renpyWriter } from "./formats/renpy/writer.js";
export { resxReader } from "./formats/resx/reader.js";
export { parseResx } from "./formats/resx/resources.js";
export { resxWriter } from "./formats/resx/writer.js";
export { rimworldReader } from "./formats/rimworld/reader.js";
export { rimworldWriter } from "./formats/rimworld/writer.js";
export { srtReader } from "./formats/srt/reader.js";
export { srtWriter } from "./formats/srt/writer.js";
export { vttReader } from "./formats/vtt/reader.js";
export { vttWriter } from "./formats/vtt/writer.js";
export { WRITERS, writerFor } from "./formats/writers.js";
export { catalogTexts, parseCatalog, xcodeJson } from "./formats/xcstrings/catalog.js";
export { xcstringsReader } from "./formats/xcstrings/reader.js";
export { xcstringsWriter } from "./formats/xcstrings/writer.js";
export { xliffReader } from "./formats/xliff/reader.js";
export { xliffWriter } from "./formats/xliff/writer.js";
export { workbookParts, xlsxReader } from "./formats/xlsx/reader.js";
export { xlsxWriter } from "./formats/xlsx/writer.js";
export { yamlReader } from "./formats/yaml/reader.js";
export { yamlWriter } from "./formats/yaml/writer.js";
export type { ZipEntry, ZipInput } from "./formats/zip/zip.js";
export { crc32, readZip, writeZip, ZipError } from "./formats/zip/zip.js";
export type { AnthropicOptions } from "./providers/anthropic/provider.js";
export { createAnthropicProvider } from "./providers/anthropic/provider.js";
export type { DeepLOptions } from "./providers/deepl/provider.js";
export { createDeepLProvider } from "./providers/deepl/provider.js";
export type { ProviderDependencies } from "./providers/factory.js";
export { createProvider } from "./providers/factory.js";
export type { GeminiOptions } from "./providers/gemini/provider.js";
export { createGeminiProvider } from "./providers/gemini/provider.js";
export type { MockOptions, MockProvider } from "./providers/mock/provider.js";
export { createMockProvider } from "./providers/mock/provider.js";
export type { OllamaOptions } from "./providers/ollama/provider.js";
export { createOllamaProvider } from "./providers/ollama/provider.js";
export type { OpenAiCompatibleOptions } from "./providers/openai-compatible/provider.js";
export { createOpenAiCompatibleProvider } from "./providers/openai-compatible/provider.js";
export type { UsageEstimate } from "./providers/usage.js";
export { estimateUsage } from "./providers/usage.js";
export { CsvError } from "./storage/csv.js";
export { decodeText, EncodingError, encodeText } from "./storage/encoding.js";
export { loadMemory, MemoryFileError, saveMemory } from "./storage/memory-store.js";
export type { ImportResult, ReviewStatus } from "./storage/review.js";
export { exportReviewCsv, importReviewCsv } from "./storage/review.js";
export { VERSION } from "./version.js";
