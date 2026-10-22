import { glob, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  buildProject,
  CONFIG_FILE,
  createProvider,
  DEFAULT_OUTPUT,
  type Detection,
  detectSources,
  editJsonc,
  extractSegments,
  formatOf,
  loadMemory,
  openProject,
  type Project,
  type Provider,
  type ProviderConfig,
  parseConfig,
  parseProviderConfig,
  renderConfig,
  saveMemory,
  selectSegments,
  stripJsonComments,
  translateSegments,
  writeFileAtomic,
} from "tradforge";
import type {
  BuiltView,
  EngineStatus,
  EngineType,
  EntryView,
  ProgressView,
  ProjectView,
  SettingsView,
  SourceView,
  TranslationResult,
} from "../shared/bridge.js";
import { AppError } from "./errors.js";

/**
 * What the application does with a project folder, on top of the library: the same steps as the command line
 * (init, translate, review, build), as functions that return plain data for the page. Every call reads the folder
 * again, so that the application and the command line can be used on the same project.
 */

export interface WorkspaceDependencies {
  /** Where API keys are read. Default: process.env. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Injected in tests, so that they never need the network. */
  readonly fetch?: typeof globalThis.fetch;
  readonly createProvider?: (config: ProviderConfig) => Provider;
}

export interface TranslateOptions {
  readonly retryFailed: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ProgressView) => void;
}

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
/** Ollama answers at once when it runs: no need to wait long to know it does not. */
const OLLAMA_STATUS_TIMEOUT_MS = 3000;

export function createWorkspace(dependencies: WorkspaceDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const engine = dependencies.createProvider ?? ((config: ProviderConfig) => createProvider(config, { env, fetch }));

  return {
    /** A folder, or one file: then its folder is the project, and the file its only source. */
    async open(target: string, sourceLanguage: string, targetLanguage: string): Promise<ProjectView> {
      const { root, file } = await locate(target);
      if (await hasConfig(root)) {
        const project = await projectView(await openProject(root));
        return file === undefined ? project : { ...project, file };
      }
      const { sources, skipped } = await candidates(root, file, sourceLanguage, targetLanguage);
      return {
        root,
        ...(file !== undefined ? { file } : {}),
        configured: false,
        sourceLanguage,
        targetLanguage,
        sources: sources.map(({ format, include, files, output }) => ({ format, include, files, output })),
        skipped,
      };
    },

    async createProject(
      target: string,
      sourceLanguage: string,
      targetLanguage: string,
      chosen: readonly number[],
    ): Promise<ProjectView> {
      const { root, file } = await locate(target);
      if (await hasConfig(root))
        throw new AppError("config-exists", { root }, `${CONFIG_FILE} already exists in ${root}`);
      const { sources } = await candidates(root, file, sourceLanguage, targetLanguage);
      const kept = sources.filter((_, index) => chosen.includes(index));
      if (kept.length === 0) throw new AppError("no-format-chosen", {}, "Choose at least one format to translate");
      await writeFileAtomic(configFile(root), renderConfig({ sourceLanguage, targetLanguage, sources: kept }));
      const project = await projectView(await openProject(root));
      return file === undefined ? project : { ...project, file };
    },

    async settings(root: string): Promise<SettingsView> {
      return settingsView(await openProject(root));
    },

    async saveSettings(root: string, settings: SettingsView): Promise<SettingsView> {
      const project = await openProject(root);
      const raw = await readRawConfig(root);
      const changed = withSettings(raw, settings);
      parseConfig(changed); // throws ConfigError, with every problem, before anything is written
      const languages = { sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage };
      if (!sameLanguages(project.config, languages)) {
        const memory = await loadMemory(project.workDir, project.config);
        if (memory.entryList().length > 0 || memory.failureList().length > 0) {
          const { sourceLanguage: from, targetLanguage: to } = project.config;
          throw new AppError(
            "languages-locked",
            { from, to },
            `The memory of this project holds translations from ${from} → ${to}: ` +
              "open a copy of the project to translate it into another language",
          );
        }
      }
      // Only the values that changed are rewritten: the comments that explain the settings stay.
      const text = await readFile(configFile(root), "utf8");
      let edited = text;
      for (const path of EDITED_PATHS) {
        const [before, after] = [valueAt(raw, path), valueAt(changed, path)];
        if (JSON.stringify(before) !== JSON.stringify(after)) edited = editJsonc(edited, path, after);
      }
      if (edited !== text) await writeFileAtomic(configFile(root), edited);
      return settingsView(await openProject(root));
    },

    async engineStatus(root: string, settings: SettingsView): Promise<EngineStatus> {
      if (settings.engine === "ollama") return ollamaStatus(settings.address || DEFAULT_OLLAMA_HOST, fetch);
      const keyVariable = await keyVariableOf(root, settings.engine);
      return { kind: "api", ready: (env[keyVariable] ?? "").trim() !== "", keyVariable };
    },

    async translate(root: string, options: TranslateOptions): Promise<TranslationResult> {
      const { config, workDir } = await openProject(root);
      const segments = await extractSegments(root, config);
      const memory = await loadMemory(workDir, config);
      const { todo } = selectSegments(segments, memory, { retryFailed: options.retryFailed });
      if (todo.length === 0) return { total: 0, translated: 0, reused: 0, failed: 0, interrupted: false };

      let last: ProgressView = { done: 0, total: todo.length, translated: 0, failed: 0 };
      const report = (progress: ProgressView) => {
        last = progress;
        options.onProgress?.(progress);
      };
      report(last);
      const summary = await translateSegments({
        segments,
        memory,
        provider: engine(config.provider),
        config,
        save: () => saveMemory(workDir, memory),
        retryFailed: options.retryFailed,
        onProgress: ({ done, total, translated, failed, remainingMs }) =>
          report({ done, total, translated, failed, ...(remainingMs !== undefined ? { remainingMs } : {}) }),
        onRateLimit: ({ waitMs }) => report({ ...last, waitMs }),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
      const { total, translated, reused, failed, interrupted } = summary;
      return { total, translated, reused, failed, interrupted };
    },

    async entries(root: string): Promise<EntryView[]> {
      const { config, workDir } = await openProject(root);
      const segments = await extractSegments(root, config);
      const memory = await loadMemory(workDir, config);
      return segments.map((segment) => entryView(segment, memory));
    },

    async review(root: string, source: string, target: string): Promise<EntryView> {
      if (target.trim() === "") throw new AppError("empty-translation", {}, "A translation cannot be empty");
      const { config, workDir } = await openProject(root);
      const segment = (await extractSegments(root, config)).find((candidate) => candidate.source === source);
      if (segment === undefined) {
        throw new AppError("text-gone", { source }, `This text is not in the project anymore: ${source}`);
      }
      const memory = await loadMemory(workDir, config);
      memory.importTranslation(source, target);
      await saveMemory(workDir, memory);
      return entryView(segment, memory);
    },

    async build(root: string, force: boolean): Promise<BuiltView[]> {
      const { config, workDir } = await openProject(root);
      const memory = await loadMemory(workDir, config);
      const built = await buildProject(root, config, memory, { force });
      return built.map(({ output, translated, untranslated, written }) => ({
        output,
        translated,
        untranslated,
        written,
      }));
    },
  };
}

export type Workspace = ReturnType<typeof createWorkspace>;

type Memory = Awaited<ReturnType<typeof loadMemory>>;
type Segments = Awaited<ReturnType<typeof extractSegments>>;

function entryView(segment: Segments[number], memory: Memory): EntryView {
  const entry = memory.get(segment.source);
  const failure = entry === undefined ? memory.getFailure(segment.source) : undefined;
  return {
    source: segment.source,
    ...(entry !== undefined ? { target: entry.target } : {}),
    state: entry?.status ?? (failure !== undefined ? "failed" : "pending"),
    ...(failure !== undefined ? { reason: failure.reason } : {}),
    ...(segment.context !== undefined ? { context: segment.context } : {}),
    file: segment.locations[0]?.file ?? "",
  };
}

async function projectView({ root, config, workDir }: Project): Promise<ProjectView> {
  const segments = await extractSegments(root, config);
  const memory = await loadMemory(workDir, config);
  const { total, translated, reviewed, failed, pending } = memory.stats(segments.map((segment) => segment.source));
  const sources: SourceView[] = config.sources.map(({ format, include, output }) => ({
    format,
    include,
    output: output.path,
  }));
  return {
    root,
    configured: true,
    sourceLanguage: config.sourceLanguage,
    targetLanguage: config.targetLanguage,
    sources,
    skipped: [],
    stats: { total, translated, reviewed, failed, pending },
  };
}

function settingsView({ config }: Project): SettingsView {
  const { provider } = config;
  const address =
    provider.type === "ollama" ? provider.host : provider.type === "openai-compatible" ? provider.baseUrl : "";
  return {
    sourceLanguage: config.sourceLanguage,
    targetLanguage: config.targetLanguage,
    engine: provider.type,
    model: provider.model,
    address,
    instructions: config.translation.instructions ?? "",
  };
}

/**
 * The configuration with the settings of the page. The settings of the same engine that the page does not show
 * (API key variable, prices) are kept; a new engine starts from its defaults.
 */
function withSettings(raw: Record<string, unknown>, settings: SettingsView): Record<string, unknown> {
  const previous = isObject(raw.provider) ? raw.provider : {};
  const provider: Record<string, unknown> =
    (previous.type ?? "ollama") === settings.engine
      ? { ...previous, type: settings.engine }
      : { type: settings.engine };
  setOrDelete(provider, "model", settings.model);
  if (settings.engine === "ollama") setOrDelete(provider, "host", settings.address);
  if (settings.engine === "openai-compatible") setOrDelete(provider, "baseUrl", settings.address);

  const translation: Record<string, unknown> = isObject(raw.translation) ? { ...raw.translation } : {};
  setOrDelete(translation, "instructions", settings.instructions);
  return {
    ...raw,
    sourceLanguage: settings.sourceLanguage.trim(),
    targetLanguage: settings.targetLanguage.trim(),
    provider,
    translation,
  };
}

/** The parts of the configuration that the settings screen edits. */
const EDITED_PATHS: readonly (readonly string[])[] = [
  ["sourceLanguage"],
  ["targetLanguage"],
  ["provider"],
  ["translation", "instructions"],
];

function valueAt(raw: Record<string, unknown>, path: readonly string[]): unknown {
  let value: unknown = raw;
  for (const key of path) value = isObject(value) ? value[key] : undefined;
  return value;
}

function setOrDelete(target: Record<string, unknown>, key: string, value: string): void {
  if (value.trim() === "") delete target[key];
  else target[key] = value.trim();
}

/** The variable that holds the key of an engine: the configured one for the same engine, else its default. */
async function keyVariableOf(root: string, engine: Exclude<EngineType, "ollama">): Promise<string> {
  const raw = (await hasConfig(root)) ? await readRawConfig(root) : {};
  const configured = isObject(raw.provider) && raw.provider.type === engine ? raw.provider : {};
  // Only the key variable matters here: a placeholder model satisfies the engines that require one.
  const provider = parseProviderConfig({ ...(engine === "deepl" ? {} : { model: "-" }), ...configured, type: engine });
  return "apiKeyEnv" in provider ? provider.apiKeyEnv : "";
}

async function ollamaStatus(address: string, fetch: typeof globalThis.fetch): Promise<EngineStatus> {
  const host = address.trim().replace(/\/+$/, "");
  try {
    const response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(OLLAMA_STATUS_TIMEOUT_MS) });
    if (!response.ok) return { kind: "ollama", ready: false, host, httpStatus: response.status };
    const body: unknown = await response.json();
    const models = isObject(body) && Array.isArray(body.models) ? body.models : [];
    const names = models.flatMap((model) => (isObject(model) && typeof model.name === "string" ? [model.name] : []));
    return { kind: "ollama", ready: true, host, models: names.sort() };
  } catch {
    return { kind: "ollama", ready: false, host };
  }
}

/** The project folder of what was opened, and the file when one was opened alone (relative, with "/"). */
async function locate(target: string): Promise<{ root: string; file?: string }> {
  const info = await stat(target).catch(() => undefined);
  if (info === undefined) throw new AppError("not-found", { path: target }, `Nothing at ${target}`);
  if (info.isDirectory()) return { root: target };
  return { root: path.dirname(target), file: path.basename(target) };
}

/**
 * The sources a new project would have. For a file opened alone: the source detection finds for it, narrowed to
 * that file, or else its format by extension, written next to it ({dir}/{name}.{lang}{ext}).
 */
async function candidates(
  root: string,
  file: string | undefined,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<Detection> {
  const detection = await detectSources(root, sourceLanguage, targetLanguage);
  if (file === undefined) return detection;
  for (const source of detection.sources) {
    if (await matchesAny(root, source.include, file)) {
      return { sources: [{ ...source, include: [escapeGlob(file)], files: 1 }], skipped: [] };
    }
  }
  const format = formatOf(file);
  if (format === undefined) throw new AppError("file-not-supported", { file }, `${file}: not a format tradforge reads`);
  const source = { format, include: [escapeGlob(file)], files: 1, output: DEFAULT_OUTPUT.path };
  return { sources: [source], skipped: [] };
}

async function matchesAny(root: string, patterns: readonly string[], file: string): Promise<boolean> {
  for (const pattern of patterns) {
    for await (const match of glob(pattern, { cwd: root })) {
      if (match.replaceAll("\\", "/") === file) return true;
    }
  }
  return false;
}

/** A file name as a pattern that matches only itself: "Notes [draft].md" has glob characters. */
function escapeGlob(file: string): string {
  return file.replace(/[[\]*?{}()!]/g, (char) => `[${char}]`);
}

/** A JSON object, as opposed to an array or a value. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameLanguages(
  a: { readonly sourceLanguage: string; readonly targetLanguage: string },
  b: { readonly sourceLanguage: string; readonly targetLanguage: string },
): boolean {
  return a.sourceLanguage === b.sourceLanguage.trim() && a.targetLanguage === b.targetLanguage.trim();
}

function configFile(root: string): string {
  return path.join(root, CONFIG_FILE);
}

async function hasConfig(root: string): Promise<boolean> {
  return stat(configFile(root)).then(
    (info) => info.isFile(),
    () => false,
  );
}

async function readRawConfig(root: string): Promise<Record<string, unknown>> {
  const raw: unknown = JSON.parse(stripJsonComments(await readFile(configFile(root), "utf8")));
  if (!isObject(raw)) throw new AppError("config-invalid", {}, `${configFile(root)} must hold a JSON object`);
  return raw;
}
