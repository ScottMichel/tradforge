import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  buildProject,
  CONFIG_FILE,
  createProvider,
  detectSources,
  extractSegments,
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
    async openFolder(root: string, sourceLanguage: string, targetLanguage: string): Promise<ProjectView> {
      await mustBeFolder(root);
      if (await hasConfig(root)) return projectView(await openProject(root));
      const { sources, skipped } = await detectSources(root, sourceLanguage, targetLanguage);
      return {
        root,
        configured: false,
        sourceLanguage,
        targetLanguage,
        sources: sources.map(({ format, include, files, output }) => ({ format, include, files, output })),
        skipped,
      };
    },

    async createProject(
      root: string,
      sourceLanguage: string,
      targetLanguage: string,
      chosen: readonly number[],
    ): Promise<ProjectView> {
      await mustBeFolder(root);
      if (await hasConfig(root)) throw new Error(`${CONFIG_FILE} already exists in ${root}`);
      const { sources } = await detectSources(root, sourceLanguage, targetLanguage);
      const kept = sources.filter((_, index) => chosen.includes(index));
      if (kept.length === 0) throw new Error("Choose at least one format to translate");
      await writeFileAtomic(configFile(root), renderConfig({ sourceLanguage, targetLanguage, sources: kept }));
      return projectView(await openProject(root));
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
          throw new Error(
            `The memory of this project holds translations from ${project.config.sourceLanguage} → ` +
              `${project.config.targetLanguage}: open a copy of the project to translate it into another language`,
          );
        }
      }
      if (JSON.stringify(changed) !== JSON.stringify(raw)) {
        await writeFileAtomic(configFile(root), `${JSON.stringify(changed, null, 2)}\n`);
      }
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
      if (target.trim() === "") throw new Error("A translation cannot be empty");
      const { config, workDir } = await openProject(root);
      const segment = (await extractSegments(root, config)).find((candidate) => candidate.source === source);
      if (segment === undefined) throw new Error(`This text is not in the project anymore: ${source}`);
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
    if (!response.ok) return { kind: "ollama", ready: false, message: `Ollama at ${host} answered ${response.status}` };
    const body: unknown = await response.json();
    const models = isObject(body) && Array.isArray(body.models) ? body.models : [];
    const names = models.flatMap((model) => (isObject(model) && typeof model.name === "string" ? [model.name] : []));
    return { kind: "ollama", ready: true, models: names.sort() };
  } catch {
    return { kind: "ollama", ready: false, message: `Ollama does not answer at ${host}: is it running?` };
  }
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

async function mustBeFolder(root: string): Promise<void> {
  const info = await stat(root).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) throw new Error(`No folder at ${root}`);
}

async function readRawConfig(root: string): Promise<Record<string, unknown>> {
  const raw: unknown = JSON.parse(stripJsonComments(await readFile(configFile(root), "utf8")));
  if (!isObject(raw)) throw new Error(`${configFile(root)} must hold a JSON object`);
  return raw;
}
