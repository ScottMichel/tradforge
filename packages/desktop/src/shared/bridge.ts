/**
 * The bridge between the page and Node.js. The page runs without Node.js, like a web page; it reaches the main
 * process only through these functions, which the preload script exposes as window.tradforge. Everything that
 * crosses it is plain data (structured clone): no class, no function.
 */

/** A file format found in the project, or written in its configuration. */
export interface SourceView {
  readonly format: string;
  readonly include: readonly string[];
  /** Files matched, when known (detection). */
  readonly files?: number;
  /** Where the translations are written: a path pattern ({dir}/{name}.{lang}{ext}). */
  readonly output: string;
}

export interface SkippedView {
  readonly file: string;
  readonly reason: string;
}

/** How far the translation of the project is. */
export interface ProjectStats {
  readonly total: number;
  readonly translated: number;
  readonly reviewed: number;
  readonly failed: number;
  readonly pending: number;
}

/** An opened folder or file: a tradforge project already, or the formats found in it. */
export interface ProjectView {
  /** The folder of the project: the one opened, or the folder of the file opened. */
  readonly root: string;
  /** The file opened alone, relative to the root. */
  readonly file?: string;
  /** True when the folder has a tradforge.config.json. */
  readonly configured: boolean;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly sources: readonly SourceView[];
  /** Files detection left out, and why (new projects only). */
  readonly skipped: readonly SkippedView[];
  /** Configured projects only. */
  readonly stats?: ProjectStats;
}

export const ENGINE_TYPES = ["ollama", "deepl", "gemini", "anthropic", "openai-compatible"] as const;
export type EngineType = (typeof ENGINE_TYPES)[number];

/** The settings the application edits; the rest of the configuration is kept as it is. */
export interface SettingsView {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly engine: EngineType;
  readonly model: string;
  /** Ollama: http://localhost:11434. OpenAI-compatible: the API address. Empty for the others. */
  readonly address: string;
  readonly instructions: string;
}

/** Whether the engine can be used now. The API key itself never crosses the bridge. */
export type EngineStatus =
  | { readonly kind: "ollama"; readonly ready: true; readonly host: string; readonly models: readonly string[] }
  | { readonly kind: "ollama"; readonly ready: false; readonly host: string; readonly httpStatus?: number }
  | { readonly kind: "api"; readonly ready: boolean; readonly keyVariable: string };

/** Sent while a translation runs. */
export interface ProgressView {
  readonly done: number;
  readonly total: number;
  readonly translated: number;
  readonly failed: number;
  readonly remainingMs?: number;
  /** Set while the engine asks to slow down. */
  readonly waitMs?: number;
}

export interface TranslationResult {
  /** Texts to translate when the run started. */
  readonly total: number;
  readonly translated: number;
  readonly reused: number;
  readonly failed: number;
  readonly interrupted: boolean;
}

export type EntryState = "pending" | "failed" | "machine" | "reviewed";

/** One unique text of the project, with its translation if there is one. */
export interface EntryView {
  readonly source: string;
  readonly target?: string;
  readonly state: EntryState;
  /** Why the last attempt failed. */
  readonly reason?: string;
  readonly context?: string;
  /** First file where the text appears. */
  readonly file: string;
}

export interface BuiltView {
  readonly output: string;
  readonly translated: number;
  readonly untranslated: number;
  readonly written: boolean;
}

/**
 * What went wrong, as a code the page words in the language of the interface. The detail is the technical message
 * (from the library, in English), shown under the explanation for those who need it.
 */
export const ERROR_CODES = [
  "not-found",
  "file-not-supported",
  "config-exists",
  "no-format-chosen",
  "languages-locked",
  "busy",
  "empty-translation",
  "text-gone",
  "config-invalid",
  "file-unreadable",
  "output-refused",
  "engine-unavailable",
  "memory-unreadable",
  "unexpected",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorView {
  readonly code: ErrorCode;
  readonly params: Readonly<Record<string, string>>;
  readonly detail?: string;
}

/** Electron would turn a thrown error into "Error invoking remote method...": the main process sends this instead. */
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorView };

/** What the page asks the main process for. */
export interface Requests {
  /** The version of the tradforge library the application runs. */
  version(): Promise<string>;
  /** Asks the user for a folder or a file, with a dialog titled in the language of the interface. */
  choose(kind: "folder" | "file", title: string): Promise<string | undefined>;
  /** Opens a folder or one file: its project, or what detection finds. */
  open(path: string, sourceLanguage: string, targetLanguage: string): Promise<ProjectView>;
  /** Writes tradforge.config.json with the chosen detected formats (their indexes in ProjectView.sources). */
  createProject(
    path: string,
    sourceLanguage: string,
    targetLanguage: string,
    chosen: readonly number[],
  ): Promise<ProjectView>;
  settings(root: string): Promise<SettingsView>;
  saveSettings(root: string, settings: SettingsView): Promise<SettingsView>;
  /** Whether the engine of these settings (saved or not) can be used now. */
  engineStatus(root: string, settings: SettingsView): Promise<EngineStatus>;
  translate(root: string, retryFailed: boolean): Promise<TranslationResult>;
  /** Stops the running translation between two batches; what is done is kept. */
  stopTranslation(): Promise<void>;
  entries(root: string): Promise<readonly EntryView[]>;
  /** Saves a translation checked by a human: no engine will replace it. */
  review(root: string, source: string, target: string): Promise<EntryView>;
  /** Writes the translated files. */
  build(root: string, force: boolean): Promise<readonly BuiltView[]>;
}

/** window.tradforge: every request answers an Outcome, plus two helpers that stay in the page. */
export type TradforgeBridge = {
  readonly [K in keyof Requests]: Requests[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<Outcome<R>>
    : never;
} & {
  /** The path of a file or folder dropped on the page. */
  pathOf(file: File): string;
  /** Listens to the progress of translations; returns what stops listening. */
  onProgress(listener: (progress: ProgressView) => void): () => void;
};

/** The message each request sends to the main process: "tradforge:" and its name. */
export type Channel = `tradforge:${keyof Requests}`;

/** Sent by the main process to the page. */
export type Event = "tradforge:progress";
