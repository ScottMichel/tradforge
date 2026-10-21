import { effectivePlaceholders, type TradforgeConfig } from "./config.js";
import { diffSources } from "./diff.js";
import type { TranslationMemory } from "./memory.js";
import { ProtectionError, protectPlaceholders, restorePlaceholders } from "./protection.js";
import {
  BatchError,
  type ContextLine,
  type PreviousTranslation,
  type Provider,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
  type TranslationRequest,
} from "./provider.js";
import { reuseTranslation } from "./reuse.js";
import type { Segment } from "./types.js";
import { fixTypography } from "./typography.js";
import { type ValidationIssue, validateTranslation } from "./validation/validate.js";

/** The parts of the configuration the pipeline needs. */
export type PipelineConfig = Pick<
  TradforgeConfig,
  "sourceLanguage" | "targetLanguage" | "sources" | "translation" | "validation"
>;

export interface PipelineOptions {
  /** Unique texts of the project, sorted by priority then file order (see groupOccurrences). */
  readonly segments: readonly Segment[];
  readonly memory: TranslationMemory;
  readonly provider: Provider;
  readonly config: PipelineConfig;
  /** Called after every batch, even a failed one: the caller writes the memory to disk. */
  readonly save: () => Promise<void>;
  readonly onProgress?: (event: ProgressEvent) => void;
  /** Aborting stops the run cleanly between batches (Ctrl+C). */
  readonly signal?: AbortSignal;
  /** Maximum number of texts to translate in this run. */
  readonly limit?: number;
  /** Also retry the texts that failed in a previous run. */
  readonly retryFailed?: boolean;
  /** Injected in tests, for predictable time estimates. */
  readonly now?: () => number;
  /** Called when the engine asks to slow down, before waiting. */
  readonly onRateLimit?: (event: RateLimitEvent) => void;
  /** Injected in tests, so that they never really wait. Must end early when the signal aborts. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface RateLimitEvent {
  /** How long every batch waits before the next request. */
  readonly waitMs: number;
}

export interface ProgressEvent {
  /** Texts processed in this run (translated + failed). */
  readonly done: number;
  /** Texts to process in this run. */
  readonly total: number;
  readonly translated: number;
  readonly failed: number;
  readonly elapsedMs: number;
  /** Estimate from the characters still to translate and the speed so far. */
  readonly remainingMs?: number;
}

export interface PipelineSummary {
  /** Texts processed in this run. */
  readonly total: number;
  /** Texts skipped because the memory already had them (translated, or failed without retryFailed). */
  readonly alreadyDone: number;
  /** Texts translated in this run, reused ones included. */
  readonly translated: number;
  /** Part of translated: copied from the translation of a text that only changed its punctuation. */
  readonly reused: number;
  readonly failed: number;
  readonly interrupted: boolean;
}

/** A text gets at most this many tries per run: the whole batch, a quarter of it, then alone. */
const MAX_ATTEMPTS = 3;

/** Waits in a row for one request before giving up: the limit is too low for this concurrency. */
const MAX_RATE_LIMIT_WAITS = 6;

/** Timeouts in a row before the engine is taken as down. */
const MAX_SILENCES = 3;

/** Waits when the server does not say how long: 1 s, 2 s, 4 s... at most a minute. */
const FIRST_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;

/** Recorded as the "model" of a translation copied from an older version of its text. */
const REUSE_MODEL = "reuse";

interface Tally {
  translated: number;
  reused: number;
  failed: number;
  /** Characters of the processed sources, for the time estimate. */
  chars: number;
}

interface Rejected {
  readonly segment: Segment;
  readonly reason: string;
}

/** Everything a run computes once and every batch uses. */
interface Run {
  readonly options: PipelineOptions;
  readonly tally: Tally;
  /** Old version of a changed text and its translation, shown to the model as a hint. */
  readonly previous: ReadonlyMap<string, PreviousTranslation>;
  readonly neighbours: Neighbours;
  readonly pause: SharedPause;
  /** Timeouts in a row, across every batch in flight; any answer sets it back to 0. */
  readonly silences: { count: number };
}

/**
 * Translates the texts that the memory does not have yet, batch by batch.
 * Every answer is validated; rejected texts are retried in smaller groups, then logged as failures.
 */
export async function translateSegments(options: PipelineOptions): Promise<PipelineSummary> {
  const { config, signal } = options;
  const now = options.now ?? Date.now;

  const { todo: selected, alreadyDone } = selectSegments(options.segments, options.memory, options);
  const totalChars = countChars(selected);
  const tally: Tally = { translated: 0, reused: 0, failed: 0, chars: 0 };
  const start = now();

  const { todo, previous } = config.translation.reuse
    ? reuseChangedTexts(selected, options, tally)
    : { todo: selected, previous: new Map() };
  if (tally.reused > 0) await options.save();

  const run: Run = {
    options,
    tally,
    previous,
    neighbours: new Neighbours(options.segments),
    pause: new SharedPause(options.sleep ?? sleep, signal),
    silences: { count: 0 },
  };
  const save = oneAtATime(options.save);
  const queue = chunkByGroup(todo, config.translation.batchSize);
  let next = 0;
  let interrupted = false;
  let fatal: { readonly error: unknown } | undefined;

  const reportProgress = () => {
    const elapsedMs = now() - start;
    const remainingMs =
      tally.chars > 0 ? Math.round((elapsedMs * (totalChars - tally.chars)) / tally.chars) : undefined;
    options.onProgress?.({
      done: tally.translated + tally.failed,
      total: selected.length,
      translated: tally.translated,
      failed: tally.failed,
      elapsedMs,
      ...(remainingMs !== undefined ? { remainingMs } : {}),
    });
  };

  /**
   * Takes the next batch of the queue as soon as it is free. Several workers share one queue, so that a slow
   * batch never holds the others up. JavaScript runs one piece of code at a time: next++ cannot be raced.
   */
  const worker = async () => {
    while (fatal === undefined) {
      const batch = queue[next++];
      if (batch === undefined) return;
      if (isAborted(signal)) {
        interrupted = true;
        return;
      }
      try {
        await translateWithRetries(batch, run);
      } catch (error) {
        if (isAborted(signal)) {
          interrupted = true;
          return;
        }
        // ProviderUnavailableError and other fatal errors stop the run: no new batch starts, those in flight end.
        fatal ??= { error };
        return;
      } finally {
        await save(); // whatever happened, keep what this batch achieved
      }
      reportProgress();
    }
  };

  const workers = Math.min(config.translation.concurrency, queue.length);
  await Promise.all(Array.from({ length: workers }, worker));
  if (fatal !== undefined) throw fatal.error;

  return {
    total: selected.length,
    alreadyDone,
    translated: tally.translated,
    reused: tally.reused,
    failed: tally.failed,
    interrupted,
  };
}

export interface Selection {
  /** The texts to translate in this run, in order. */
  readonly todo: readonly Segment[];
  /** Texts skipped because the memory already has them. */
  readonly alreadyDone: number;
}

/** The texts a run will translate: not in the memory, past failures only with retryFailed, at most limit. */
export function selectSegments(
  segments: readonly Segment[],
  memory: TranslationMemory,
  options: { readonly retryFailed?: boolean; readonly limit?: number } = {},
): Selection {
  const candidates = segments.filter(
    (segment) =>
      memory.get(segment.source) === undefined &&
      (options.retryFailed === true || memory.getFailure(segment.source) === undefined),
  );
  const todo = options.limit === undefined ? candidates : candidates.slice(0, options.limit);
  return { todo, alreadyDone: segments.length - candidates.length };
}

/**
 * Texts that replace a text of the memory no longer in the project (a small edit): when only the punctuation
 * changed, the old translation is adapted and saved without the model; otherwise it becomes a hint for the model.
 */
function reuseChangedTexts(
  todo: readonly Segment[],
  options: PipelineOptions,
  tally: Tally,
): { todo: readonly Segment[]; previous: Map<string, PreviousTranslation> } {
  const previous = new Map<string, PreviousTranslation>();
  const current = new Set(options.segments.map((segment) => segment.source));
  const stale = new Map(
    options.memory
      .entryList()
      .filter((entry) => !current.has(entry.source))
      .map((entry) => [entry.source, entry]),
  );
  if (stale.size === 0) return { todo, previous };

  const reused = new Set<string>();
  for (const { from, to } of diffSources(
    todo.map((segment) => segment.source),
    stale.keys(),
  ).changed) {
    const old = stale.get(from);
    if (old === undefined) continue;
    const copy = reuseTranslation(from, to, old.target);
    const target = copy === undefined ? undefined : polish(copy, options.config);
    if (target !== undefined && check(to, target, options.config).length === 0) {
      options.memory.recordMachine(to, target, REUSE_MODEL);
      reused.add(to);
      tally.translated++;
      tally.reused++;
      tally.chars += to.length;
    } else {
      previous.set(to, { source: from, translation: old.target });
    }
  }
  return { todo: todo.filter((segment) => !reused.has(segment.source)), previous };
}

/** Whole batch, then quarters, then one text at a time; what still fails is logged with its last reason. */
async function translateWithRetries(batch: readonly Segment[], run: Run): Promise<void> {
  let pending: Rejected[] = batch.map((segment) => ({ segment, reason: "" }));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length > 0; attempt++) {
    const size = attempt === 1 ? batch.length : attempt === 2 ? Math.ceil(batch.length / 4) : 1;
    const rejected: Rejected[] = [];
    for (const group of chunkByGroup(
      pending.map((item) => item.segment),
      size,
    )) {
      for (const item of await translateGroup(group, run)) rejected.push(item);
    }
    pending = rejected;
  }
  const { memory, provider } = run.options;
  for (const { segment, reason } of pending) {
    memory.recordFailure(segment.source, reason, provider.model);
    run.tally.failed++;
    run.tally.chars += segment.source.length;
  }
}

/** One request to the provider. Returns the texts to try again. */
async function translateGroup(group: readonly Segment[], run: Run): Promise<Rejected[]> {
  const { config, provider, memory } = run.options;
  const shields =
    provider.protectPlaceholders === true
      ? group.map((segment) => protectPlaceholders(segment.source, effectivePlaceholders(config)))
      : undefined;

  let answer: ReadonlyMap<number, string>;
  try {
    answer = await requestWithPatience(group, run, shields);
  } catch (error) {
    if (error instanceof BatchError) return group.map((segment) => ({ segment, reason: error.message }));
    throw error;
  }

  const rejected: Rejected[] = [];
  group.forEach((segment, id) => {
    const raw = answer.get(id);
    if (raw === undefined) {
      rejected.push({ segment, reason: "left out of the model answer" });
      return;
    }
    let target: string;
    try {
      const shield = shields?.[id];
      target = polish(shield === undefined ? raw : restorePlaceholders(raw, shield.tokens), config);
    } catch (error) {
      if (!(error instanceof ProtectionError)) throw error;
      rejected.push({ segment, reason: `placeholder-invented: ${error.message}` });
      return;
    }
    const issues = check(segment.source, target, config);
    if (issues.length > 0) {
      rejected.push({ segment, reason: issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ") });
      return;
    }
    memory.recordMachine(segment.source, target, provider.model);
    run.tally.translated++;
    run.tally.chars += segment.source.length;
  });
  return rejected;
}

/**
 * Sends the request; on a rate limit, waits and sends the same request again. The wait is shared: every batch
 * in flight holds its next request until it ends, rather than meeting the same limit.
 */
async function requestWithPatience(
  group: readonly Segment[],
  run: Run,
  shields: readonly { readonly text: string }[] | undefined,
): Promise<ReadonlyMap<number, string>> {
  const { provider, signal, onRateLimit } = run.options;
  for (let waits = 0; ; waits++) {
    await run.pause.done();
    try {
      // Built again on each try: the neighbours translated meanwhile give a better context.
      const context = { config: run.options.config, memory: run.options.memory, ...run };
      const answer = await provider.translateBatch(buildRequest(group, context, shields), signal);
      run.silences.count = 0;
      return answer;
    } catch (error) {
      if (error instanceof TimeoutError) {
        // Smaller batches help a slow engine, not a silent one: after a few silences in a row, it is down.
        if (++run.silences.count >= MAX_SILENCES) {
          throw new ProviderUnavailableError(
            `${provider.model} did not answer ${MAX_SILENCES} times in a row: the service may be down or ` +
              `overloaded, try again later (${error.message})`,
            { cause: error },
          );
        }
        throw error;
      }
      if (!(error instanceof RateLimitError)) {
        if (error instanceof BatchError) run.silences.count = 0; // an answer came, even an unreadable one
        throw error;
      }
      if (waits >= MAX_RATE_LIMIT_WAITS) {
        throw new ProviderUnavailableError(
          `the rate limit is still reached after ${MAX_RATE_LIMIT_WAITS} waits: lower translation.concurrency ` +
            `or translation.batchSize, or try again later (${error.message})`,
          { cause: error },
        );
      }
      const waitMs = error.retryAfterMs ?? Math.min(FIRST_BACKOFF_MS * 2 ** waits, MAX_BACKOFF_MS);
      if (run.pause.start(waitMs)) onRateLimit?.({ waitMs });
      await run.pause.done();
    }
  }
}

/**
 * The requests a run would send if every answer were good: same batches, same groups, same context lines (with
 * the translations known now). For estimates: no retry, no reused text, and no request is sent.
 */
export function planRequests(
  segments: readonly Segment[],
  memory: TranslationMemory,
  config: PipelineConfig,
  options: { readonly retryFailed?: boolean; readonly limit?: number } = {},
): TranslationRequest[] {
  const { todo } = selectSegments(segments, memory, options);
  const context: RequestContext = { config, memory, previous: new Map(), neighbours: new Neighbours(segments) };
  return chunkByGroup(todo, config.translation.batchSize).map((batch) => buildRequest(batch, context, undefined));
}

/** What building a request needs. */
interface RequestContext {
  readonly config: PipelineConfig;
  readonly memory: TranslationMemory;
  readonly previous: ReadonlyMap<string, PreviousTranslation>;
  readonly neighbours: Neighbours;
}

/** Ids are positions in the group: the answer is matched back by position. */
function buildRequest(
  group: readonly Segment[],
  context: RequestContext,
  shields: readonly { readonly text: string }[] | undefined,
): TranslationRequest {
  const { config } = context;
  const { instructions, glossary, contextLines } = config.translation;
  const surrounding = context.neighbours.around(group, contextLines, context.memory);
  return {
    sourceLanguage: config.sourceLanguage,
    targetLanguage: config.targetLanguage,
    items: group.map((segment, id) => {
      const previous = context.previous.get(segment.source);
      return {
        id,
        source: shields?.[id]?.text ?? segment.source,
        ...(segment.context !== undefined ? { context: segment.context } : {}),
        ...(previous !== undefined ? { previous } : {}),
      };
    }),
    ...(instructions !== undefined ? { instructions } : {}),
    glossary,
    ...(surrounding !== undefined ? { surrounding } : {}),
  };
}

/** The finishing touches applied to every translation before it is checked: the typography of the language. */
function polish(target: string, config: PipelineConfig): string {
  return config.translation.typography
    ? fixTypography(target, config.targetLanguage, effectivePlaceholders(config))
    : target;
}

function check(source: string, target: string, config: PipelineConfig): ValidationIssue[] {
  return validateTranslation(
    { source, target },
    {
      placeholders: effectivePlaceholders(config),
      glossary: config.validation.glossary ? config.translation.glossary : {},
    },
  );
}

/** The texts of each file in order, to find the lines around a batch. */
class Neighbours {
  private readonly byFile = new Map<string, Segment[]>();
  private readonly position = new Map<Segment, number>();

  constructor(segments: readonly Segment[]) {
    for (const segment of segments) {
      const file = fileOf(segment);
      const list = this.byFile.get(file) ?? [];
      this.position.set(segment, list.length);
      list.push(segment);
      this.byFile.set(file, list);
    }
  }

  /** Up to `count` lines before the first text and after the last one, in their files; undefined if none. */
  around(group: readonly Segment[], count: number, memory: TranslationMemory) {
    const first = group[0];
    const last = group.at(-1);
    if (count === 0 || first === undefined || last === undefined) return undefined;
    const inGroup = new Set(group);
    const line = (segment: Segment): ContextLine => {
      const translation = memory.get(segment.source)?.target;
      return { source: segment.source, ...(translation !== undefined ? { translation } : {}) };
    };
    const before = this.slice(first, -count).filter((segment) => !inGroup.has(segment));
    const after = this.slice(last, count).filter((segment) => !inGroup.has(segment));
    if (before.length === 0 && after.length === 0) return undefined;
    return { before: before.map(line), after: after.map(line) };
  }

  /** The `offset` texts after (positive) or before (negative) a text, in its file. */
  private slice(segment: Segment, offset: number): Segment[] {
    const list = this.byFile.get(fileOf(segment)) ?? [];
    const index = this.position.get(segment) ?? 0;
    return offset < 0 ? list.slice(Math.max(0, index + offset), index) : list.slice(index + 1, index + 1 + offset);
  }
}

function fileOf(segment: Segment): string {
  return segment.locations[0]?.file ?? "";
}

/**
 * Batches of at most `size` texts that keep each conversation group whole whenever it fits:
 * a group that does not fit in the current batch starts a new one; a group larger than a batch is split.
 */
function chunkByGroup(segments: readonly Segment[], size: number): Segment[][] {
  const batches: Segment[][] = [];
  let current: Segment[] = [];
  for (const unit of groupRuns(segments)) {
    if (unit.length > size) {
      if (current.length > 0) batches.push(current);
      current = [];
      for (const part of chunk(unit, size)) batches.push(part);
      continue;
    }
    if (current.length + unit.length > size) {
      batches.push(current);
      current = [];
    }
    for (const segment of unit) current.push(segment);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Consecutive texts of the same group, together; a text without a group stands alone. */
function groupRuns(segments: readonly Segment[]): Segment[][] {
  const runs: Segment[][] = [];
  for (const segment of segments) {
    const last = runs.at(-1);
    if (last !== undefined && segment.group !== undefined && last[0]?.group === segment.group) last.push(segment);
    else runs.push([segment]);
  }
  return runs;
}

/** One wait shared by every batch of the run. A rate limit met during a wait joins it rather than adding another. */
class SharedPause {
  private current: Promise<void> | undefined;

  constructor(
    private readonly wait: (ms: number, signal?: AbortSignal) => Promise<void>,
    private readonly signal: AbortSignal | undefined,
  ) {}

  /** Starts a wait, unless one is running. True when it started one. */
  start(ms: number): boolean {
    if (this.current !== undefined) return false;
    this.current = this.wait(ms, this.signal).finally(() => {
      this.current = undefined;
    });
    return true;
  }

  /** Ends with the current wait, at once if there is none. Rejects if the run is interrupted meanwhile. */
  done(): Promise<void> {
    return this.current ?? Promise.resolve();
  }
}

/** Waits, or rejects as soon as the signal aborts: Ctrl+C never waits for the end of a rate limit. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs the calls one after the other, never at the same time: two batches that end together must not write the
 * memory file at once. Each call waits for the previous one, even if it failed.
 */
function oneAtATime(task: () => Promise<void>): () => Promise<void> {
  let last: Promise<void> = Promise.resolve();
  return () => {
    const current = last.then(task, task);
    last = current.catch(() => {}); // a failed save is reported to its caller, not to the next one
    return current;
  };
}

/**
 * A function call, not `signal?.aborted` inline: TypeScript would remember the value checked before an
 * await and consider it unchanged, while an interruption can happen at any time.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

function countChars(segments: readonly Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.source.length, 0);
}
