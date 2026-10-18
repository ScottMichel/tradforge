import type { TradforgeConfig } from "./config.js";
import type { TranslationMemory } from "./memory.js";
import { BatchError, type Provider, type TranslationRequest } from "./provider.js";
import type { Segment } from "./types.js";
import { validateTranslation } from "./validation/validate.js";

/** The parts of the configuration the pipeline needs. */
export type PipelineConfig = Pick<TradforgeConfig, "sourceLanguage" | "targetLanguage" | "translation" | "validation">;

export interface PipelineOptions {
  /** Unique texts of the project, already sorted by priority (see groupOccurrences). */
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
  readonly translated: number;
  readonly failed: number;
  readonly interrupted: boolean;
}

/** A text gets at most this many tries per run: the whole batch, a quarter of it, then alone. */
const MAX_ATTEMPTS = 3;

interface Tally {
  translated: number;
  failed: number;
  /** Characters of the processed sources, for the time estimate. */
  chars: number;
}

interface Rejected {
  readonly segment: Segment;
  readonly reason: string;
}

/**
 * Translates the texts that the memory does not have yet, batch by batch.
 * Every answer is validated; rejected texts are retried in smaller groups, then logged as failures.
 */
export async function translateSegments(options: PipelineOptions): Promise<PipelineSummary> {
  const { memory, config, signal } = options;
  const now = options.now ?? Date.now;

  const candidates = options.segments.filter(
    (segment) =>
      memory.get(segment.source) === undefined &&
      (options.retryFailed === true || memory.getFailure(segment.source) === undefined),
  );
  const todo = options.limit === undefined ? candidates : candidates.slice(0, options.limit);
  const totalChars = countChars(todo);

  const tally: Tally = { translated: 0, failed: 0, chars: 0 };
  const start = now();
  let interrupted = false;

  for (const batch of chunk(todo, config.translation.batchSize)) {
    if (isAborted(signal)) {
      interrupted = true;
      break;
    }
    try {
      await translateWithRetries(batch, options, tally);
    } catch (error) {
      if (isAborted(signal)) {
        interrupted = true;
        break;
      }
      throw error; // ProviderUnavailableError and other fatal errors stop the run
    } finally {
      await options.save(); // whatever happened, keep what this batch achieved
    }

    const elapsedMs = now() - start;
    const remainingMs =
      tally.chars > 0 ? Math.round((elapsedMs * (totalChars - tally.chars)) / tally.chars) : undefined;
    options.onProgress?.({
      done: tally.translated + tally.failed,
      total: todo.length,
      translated: tally.translated,
      failed: tally.failed,
      elapsedMs,
      ...(remainingMs !== undefined ? { remainingMs } : {}),
    });
  }

  return {
    total: todo.length,
    alreadyDone: options.segments.length - candidates.length,
    translated: tally.translated,
    failed: tally.failed,
    interrupted,
  };
}

/** Whole batch, then quarters, then one text at a time; what still fails is logged with its last reason. */
async function translateWithRetries(batch: readonly Segment[], options: PipelineOptions, tally: Tally): Promise<void> {
  let pending: Rejected[] = batch.map((segment) => ({ segment, reason: "" }));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length > 0; attempt++) {
    const size = attempt === 1 ? batch.length : attempt === 2 ? Math.ceil(batch.length / 4) : 1;
    const rejected: Rejected[] = [];
    for (const group of chunk(pending.map((item) => item.segment), size)) {
      for (const item of await translateGroup(group, options, tally)) rejected.push(item);
    }
    pending = rejected;
  }
  for (const { segment, reason } of pending) {
    options.memory.recordFailure(segment.source, reason, options.provider.model);
    tally.failed++;
    tally.chars += segment.source.length;
  }
}

/** One request to the provider. Returns the texts to try again. */
async function translateGroup(group: readonly Segment[], options: PipelineOptions, tally: Tally): Promise<Rejected[]> {
  const { config, provider, memory } = options;
  let answer: ReadonlyMap<number, string>;
  try {
    answer = await provider.translateBatch(buildRequest(group, config), options.signal);
  } catch (error) {
    if (error instanceof BatchError) return group.map((segment) => ({ segment, reason: error.message }));
    throw error;
  }

  const rejected: Rejected[] = [];
  group.forEach((segment, id) => {
    const target = answer.get(id);
    if (target === undefined) {
      rejected.push({ segment, reason: "left out of the model answer" });
      return;
    }
    const issues = validateTranslation(
      { source: segment.source, target },
      { placeholders: config.validation.placeholders },
    );
    if (issues.length > 0) {
      rejected.push({ segment, reason: issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ") });
      return;
    }
    memory.recordMachine(segment.source, target, provider.model);
    tally.translated++;
    tally.chars += segment.source.length;
  });
  return rejected;
}

/** Ids are positions in the group: the answer is matched back by position. */
function buildRequest(group: readonly Segment[], config: PipelineConfig): TranslationRequest {
  const { instructions, glossary } = config.translation;
  return {
    sourceLanguage: config.sourceLanguage,
    targetLanguage: config.targetLanguage,
    items: group.map((segment, id) => ({
      id,
      source: segment.source,
      ...(segment.context !== undefined ? { context: segment.context } : {}),
    })),
    ...(instructions !== undefined ? { instructions } : {}),
    glossary,
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
