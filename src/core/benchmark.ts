import { TranslationMemory } from "./memory.js";
import { type PipelineConfig, type RateLimitEvent, translateSegments } from "./pipeline.js";
import { type Provider, ProviderUnavailableError } from "./provider.js";
import type { Segment } from "./types.js";

export interface Engine {
  /** How the engine is named in the report, e.g. "gemini:gemini-flash-latest". */
  readonly label: string;
  readonly provider: Provider;
}

export interface EngineResult {
  readonly label: string;
  readonly model: string;
  readonly translated: number;
  readonly failed: number;
  readonly elapsedMs: number;
  /** Accepted translations, by source text. */
  readonly targets: ReadonlyMap<string, string>;
  /** Why the rejected texts failed, by source text. */
  readonly failures: ReadonlyMap<string, string>;
  /** Set when the engine could not be used at all (no key, server down...). */
  readonly error?: string;
}

export interface BenchmarkOptions {
  readonly segments: readonly Segment[];
  readonly config: PipelineConfig;
  readonly engines: readonly Engine[];
  readonly signal?: AbortSignal;
  /** Called after each engine, for progress. */
  readonly onEngineDone?: (result: EngineResult) => void;
  /** Called when an engine asks to slow down, before waiting: a long comparison must never look stuck. */
  readonly onRateLimit?: (label: string, event: RateLimitEvent) => void;
  /** Injected in tests, for predictable times. */
  readonly now?: () => number;
}

/**
 * Translates the same texts with each engine, one engine after the other so that their times do not interfere.
 * Each one gets a fresh memory: the project memory is never touched, and no engine reuses another's work.
 * Validation, retries and typography are those of a real run.
 */
export async function benchmarkEngines(options: BenchmarkOptions): Promise<EngineResult[]> {
  const now = options.now ?? Date.now;
  const results: EngineResult[] = [];
  for (const { label, provider } of options.engines) {
    if (options.signal?.aborted === true) break;
    const memory = new TranslationMemory({ languages: options.config });
    const start = now();
    let error: string | undefined;
    try {
      await translateSegments({
        segments: options.segments,
        memory,
        provider,
        config: options.config,
        save: async () => {},
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        ...(options.onRateLimit !== undefined
          ? { onRateLimit: (event: RateLimitEvent) => options.onRateLimit?.(label, event) }
          : {}),
      });
    } catch (caught) {
      if (!(caught instanceof ProviderUnavailableError)) throw caught;
      error = caught.message;
    }
    const result: EngineResult = {
      label,
      model: provider.model,
      translated: memory.entryList().length,
      failed: memory.failureList().length,
      elapsedMs: now() - start,
      targets: new Map(memory.entryList().map((entry) => [entry.source, entry.target])),
      failures: new Map(memory.failureList().map((failure) => [failure.source, failure.reason])),
      ...(error !== undefined ? { error } : {}),
    };
    results.push(result);
    options.onEngineDone?.(result);
  }
  return results;
}
