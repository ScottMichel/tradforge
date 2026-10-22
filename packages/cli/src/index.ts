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
export { androidReader } from "./formats/apps/android/reader.js";
export { androidLanguage, pluralQuantities } from "./formats/apps/android/resources.js";
export { androidWriter } from "./formats/apps/android/writer.js";
export { arbReader, parseArb } from "./formats/apps/arb/reader.js";
export { arbWriter } from "./formats/apps/arb/writer.js";
export { iosStringsReader } from "./formats/apps/ios-strings/reader.js";
export { encodeIosString, parseIosStrings } from "./formats/apps/ios-strings/strings.js";
export { iosStringsWriter } from "./formats/apps/ios-strings/writer.js";
export { jsonReader } from "./formats/apps/json/reader.js";
export { jsonWriter } from "./formats/apps/json/writer.js";
export type { PluralForms } from "./formats/apps/po/plurals.js";
export { gettextLanguage, pluralForms } from "./formats/apps/po/plurals.js";
export { poReader } from "./formats/apps/po/reader.js";
export { poWriter } from "./formats/apps/po/writer.js";
export { propertiesReader } from "./formats/apps/properties/reader.js";
export { encodePropertiesValue, isMessageFormat, parseProperties } from "./formats/apps/properties/syntax.js";
export { propertiesWriter } from "./formats/apps/properties/writer.js";
export { resxReader } from "./formats/apps/resx/reader.js";
export { parseResx } from "./formats/apps/resx/resources.js";
export { resxWriter } from "./formats/apps/resx/writer.js";
export { catalogTexts, parseCatalog, xcodeJson } from "./formats/apps/xcstrings/catalog.js";
export { xcstringsReader } from "./formats/apps/xcstrings/reader.js";
export { xcstringsWriter } from "./formats/apps/xcstrings/writer.js";
export { xliffReader } from "./formats/apps/xliff/reader.js";
export { xliffWriter } from "./formats/apps/xliff/writer.js";
export { yamlReader } from "./formats/apps/yaml/reader.js";
export { yamlWriter } from "./formats/apps/yaml/writer.js";
export { docxReader } from "./formats/documents/docx/reader.js";
export { docxWriter } from "./formats/documents/docx/writer.js";
export type { HtmlDocument, HtmlText } from "./formats/documents/html/document.js";
export { decodeEntities, htmlTexts, parseHtml } from "./formats/documents/html/document.js";
export { htmlReader } from "./formats/documents/html/reader.js";
export { htmlWriter } from "./formats/documents/html/writer.js";
export type { MarkdownKind, MarkdownText } from "./formats/documents/markdown/blocks.js";
export { markdownTexts } from "./formats/documents/markdown/blocks.js";
export { markdownReader } from "./formats/documents/markdown/reader.js";
export { markdownWriter } from "./formats/documents/markdown/writer.js";
export type { OdtParagraph } from "./formats/documents/odt/paragraphs.js";
export { odtParagraphs, writeOdtParagraph } from "./formats/documents/odt/paragraphs.js";
export { odtParts, odtReader } from "./formats/documents/odt/reader.js";
export { odtWriter } from "./formats/documents/odt/writer.js";
export { pptxReader, slideParts } from "./formats/documents/pptx/reader.js";
export { pptxWriter } from "./formats/documents/pptx/writer.js";
export { workbookParts, xlsxReader } from "./formats/documents/xlsx/reader.js";
export { xlsxWriter } from "./formats/documents/xlsx/writer.js";
export { luaReader } from "./formats/games/lua/reader.js";
export { luaWriter } from "./formats/games/lua/writer.js";
export { paradoxLanguage } from "./formats/games/paradox-yml/languages.js";
export { paradoxReader } from "./formats/games/paradox-yml/reader.js";
export { paradoxWriter } from "./formats/games/paradox-yml/writer.js";
export { renpyReader } from "./formats/games/renpy/reader.js";
export { renpyWriter } from "./formats/games/renpy/writer.js";
export { rimworldReader } from "./formats/games/rimworld-xml/reader.js";
export { rimworldWriter } from "./formats/games/rimworld-xml/writer.js";
export { pzLanguageCode } from "./formats/games/zomboid-txt/languages.js";
export { pzReader } from "./formats/games/zomboid-txt/reader.js";
export { pzWriter } from "./formats/games/zomboid-txt/writer.js";
export type { BuildOptions, BuiltFile } from "./formats/project/build.js";
export { buildProject } from "./formats/project/build.js";
export type { DetectedSource, Detection, SkippedFile } from "./formats/project/detect.js";
export { detectSources, FORMAT_EXTENSIONS, formatOf } from "./formats/project/detect.js";
export { extractOccurrences, extractSegments } from "./formats/project/extract.js";
export type { OutputLanguages, ProjectFile } from "./formats/project/project.js";
export { listProjectFiles, OutputError, outputPath } from "./formats/project/project.js";
export { READERS, readerFor } from "./formats/readers.js";
export type { Dialect, Paragraph } from "./formats/shared/office/paragraphs.js";
export {
  DRAWING,
  INLINE_STRING,
  parseParagraphs,
  SPREADSHEET,
  WORD,
  writeParagraph,
} from "./formats/shared/office/paragraphs.js";
export type { ZipEntry, ZipInput } from "./formats/shared/zip/zip.js";
export { crc32, readZip, writeZip, ZipError } from "./formats/shared/zip/zip.js";
export { srtReader } from "./formats/subtitles/srt/reader.js";
export { srtWriter } from "./formats/subtitles/srt/writer.js";
export { vttReader } from "./formats/subtitles/vtt/reader.js";
export { vttWriter } from "./formats/subtitles/vtt/writer.js";
export { WRITERS, writerFor } from "./formats/writers.js";
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
