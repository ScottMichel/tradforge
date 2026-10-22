import type { ErrorCode } from "../../../shared/bridge.js";
import { forms, languageName, number, splitDuration } from "../format.js";

type Params = Readonly<Record<string, string>>;

/** The texts of the interface in English: the reference that every other language must translate in full. */
export const en = {
  // Menu
  steps: "Steps",
  stepProject: "Project",
  stepSettings: "Settings",
  stepTranslate: "Translation",
  stepReview: "Review",
  stepOf: (step: number) => `Step ${step} of 4`,
  interfaceLanguage: "Interface language",
  noProject: "No project open",
  menuReady: (engine: string, model: string) => `${engine} ready · ${model}`,
  menuDown: (engine: string, model: string) => `${engine} not answering · ${model}`,
  menuKey: (engine: string, model: string) => `${engine} key found · ${model}`,
  menuNoKey: (engine: string, model: string) => `${engine} without a key · ${model}`,

  // Project
  projectTitle: "What do you want to translate?",
  dropTitle: "Drop a folder or a file here",
  dropHint: "A game mod, an app, subtitles or documents: the formats are recognised on their own.",
  textLanguage: "Language of the texts",
  translateInto: "Translate into",
  openFolder: "Open a folder",
  openFile: "Open a file",
  chooseFolderTitle: "Choose a folder to translate",
  chooseFileTitle: "Choose a file to translate",
  recentProjects: "Recent projects",
  formatCount: (count: number) => forms(count, "format", "formats"),
  noFormatFound: "No file to translate was found",
  projectBadge: (translated: number, total: number) =>
    `tradforge project · ${number(translated)} of ${forms(total, "text translated", "texts translated")}`,
  newProjectBadge: "New project: choose the formats to translate",
  fileOnly: (file: string) => `File: ${file}`,
  columnTranslate: "Translate",
  columnFormat: "Format",
  columnFiles: "Files",
  columnOutput: "Written to",
  translateFormat: (format: string) => `Translate ${format}`,
  skipped: (count: number, list: string) => `${forms(count, "file", "files")} left out: ${list}`,
  showAll: "Show all",
  continueToSettings: "Continue to the settings",
  createAndContinue: "Create the project and continue",
  needsProject: "Open a project first.",
  chooseProject: "Choose a folder or a file",
  xcodeCatalog: "Xcode catalog",
  srtSubtitles: "SRT subtitles",
  vttSubtitles: "WebVTT subtitles",

  // Settings
  settingsTitle: "Settings",
  languages: "Languages",
  engineLegend: "Translation engine",
  engineLabel: "Engine",
  ollamaOption: "Ollama (local, free)",
  openAiCompatible: "OpenAI-compatible API",
  model: "Model",
  ollamaAddress: "Ollama address",
  apiAddress: "API address",
  instructionsLegend: "Instructions for the model",
  instructionsLabel: "Tone, audience, conventions…",
  saved: "Settings saved.",
  save: "Save",
  continueToTranslation: "Continue to the translation",
  ollamaDown: (host: string) => `Ollama does not answer at ${host}. Start Ollama (https://ollama.com), then come back.`,
  ollamaError: (host: string, status: number) => `Ollama at ${host} answered with an error (${status}).`,
  ollamaReady: (model: string) => `Ollama is ready, and ${model} is installed.`,
  ollamaMissingModel: (model: string) =>
    `Ollama is ready, but ${model} is not installed: run "ollama pull ${model}", or choose an installed model.`,
  apiKeyFound: (variable: string) => `API key found in the ${variable} variable.`,
  apiKeyMissing: (variable: string) =>
    `No API key: create the ${variable} environment variable with your key, then restart the application. ` +
    "The key is never written in the project.",

  // Translation
  translateTitle: "Translation",
  engineLine: (engine: string, model: string) => `Engine: ${engine} · ${model}`,
  statTotal: "texts in the project",
  statTranslated: "translated",
  statPending: "to translate",
  statFailed: "failed",
  retryFailed: "Retry the failures",
  start: "Start the translation",
  stop: "Stop",
  stopping: "Stopping after the current batch…",
  preparing: "Preparing…",
  progress: (done: number, total: number) => `${number(done)} of ${forms(total, "text", "texts")}`,
  progressFailed: (count: number) => forms(count, "failure", "failures"),
  slowDown: (seconds: number) => `the engine asks to slow down, pausing ${seconds} s`,
  nothingToTranslate: "Nothing to translate: every text has a translation.",
  nothingNewRetry: (count: number) =>
    `Nothing new to translate, ${forms(count, "text", "texts")} failed: tick "Retry the failures" to try again.`,
  stopped: (count: number) =>
    `Stopped: ${forms(count, "text translated", "texts translated")}, everything is saved. Start again to go on.`,
  done: (count: number, extra: string) => `Done: ${forms(count, "text translated", "texts translated")}${extra}.`,
  reused: (count: number) => ` (${number(count)} reused from an almost identical text)`,
  doneFailed: (count: number) => ` ${forms(count, "failure", "failures")}: correct them in the review, or retry them.`,
  continueToReview: "Continue to the review",
  duration: (ms: number) => {
    const { minutes, hours, rest } = splitDuration(ms);
    if (minutes < 1) return "less than a minute left";
    if (minutes < 60) return `about ${minutes} min left`;
    return rest === "00" ? `about ${hours} h left` : `about ${hours} h ${rest} left`;
  },

  // Writing the files
  builtFiles: "Translated files",
  buildHintTranslate: "Writes the translated version of each file, where the project expects it.",
  buildHintReview: "The translations approved here replace those of the engine.",
  build: "Write the translated files",
  force: "Replace even a file that would become much smaller",
  noSourceFile: "No source file found.",
  builtSummary: (written: number, unchanged: number) =>
    `${forms(written, "file written", "files written")}, ${number(unchanged)} already up to date.`,
  builtFile: (translated: number, total: number) => `${number(translated)} of ${number(total)} translated`,
  unchanged: "unchanged",

  // Review
  reviewTitle: "Review",
  search: "Search",
  searchPlaceholder: "Text or translation",
  filterAll: "All",
  filterFailed: "Failures",
  filterMachine: "To check",
  filterReviewed: "Reviewed",
  filterPending: "To translate",
  stateFailed: "Failed",
  stateMachine: "Engine",
  stateReviewed: "Reviewed",
  statePending: "To translate",
  approve: "Approve",
  approved: "Approved",
  rejected: (reason: string) => `Rejected: ${reason}`,
  translationOf: (source: string) => `Translation of "${source}"`,
  noText: "No text here.",
  shownOf: (shown: number, total: number) =>
    `${number(shown)} texts shown out of ${number(total)}: refine the search to find the others.`,

  // Errors
  technicalDetail: (detail: string) => `Technical detail: ${detail}`,
  errors: {
    "not-found": (p: Params) => `Nothing at ${p.path}: was it moved or deleted?`,
    "file-not-supported": (p: Params) => `tradforge cannot translate ${p.file}: its format is not supported.`,
    "config-exists": () => "This folder already has a tradforge.config.json: open it as a project.",
    "no-format-chosen": () => "Tick at least one format to translate.",
    "languages-locked": (p: Params) =>
      `This project already holds translations (${languageName(p.from ?? "")} → ${languageName(p.to ?? "")}). ` +
      "To translate it into another language, open a copy of the project.",
    busy: () => "A translation is running: wait for it to finish, or stop it.",
    "empty-translation": () => "A translation cannot be empty.",
    "text-gone": () => "This text is no longer in the project: open the review again.",
    "config-invalid": () => "The configuration of the project (tradforge.config.json) has a problem.",
    "file-unreadable": () => "A file of the project could not be read.",
    "output-refused": () => "Writing was refused, to protect your files.",
    "engine-unavailable": () => "The translation engine cannot be used right now.",
    "memory-unreadable": () => "The translation memory (.tradforge/memory.json) could not be read.",
    unexpected: () => "Something unexpected went wrong.",
  } satisfies Record<ErrorCode, (params: Params) => string>,
};

export type Messages = typeof en;
