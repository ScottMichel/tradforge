import { effectivePlaceholders } from "./config.js";
import { TranslationMemory } from "./memory.js";
import { type PipelineConfig, translateSegments } from "./pipeline.js";
import { BatchError, type Provider, RateLimitError, type Review, type ReviewItem } from "./provider.js";
import { type SuspicionCode, suspicions } from "./suspicion.js";
import type { Segment } from "./types.js";

/** An engine that can judge back-translations: every language model, not DeepL. */
export type Judge = Required<Pick<Provider, "model" | "review">>;

/** A translation to check, and why it was picked. */
export interface CheckCandidate {
  readonly source: string;
  readonly target: string;
  /** Empty when it was picked because every translation was asked for. */
  readonly reasons: readonly SuspicionCode[];
}

export interface SelectOptions {
  /** Every machine translation, not only the suspicious ones. */
  readonly all?: boolean;
  readonly limit?: number;
}

/**
 * The translations worth a back-translation: made by a model (a human's are trusted), not checked yet, and
 * suspicious unless all are asked for. In the order of the project.
 */
export function selectForCheck(
  segments: readonly Segment[],
  memory: TranslationMemory,
  config: PipelineConfig,
  options: SelectOptions = {},
): CheckCandidate[] {
  const syntaxes = effectivePlaceholders(config);
  const candidates: CheckCandidate[] = [];
  for (const { source } of segments) {
    const entry = memory.get(source);
    if (entry === undefined || entry.status !== "machine" || entry.check !== undefined) continue;
    const reasons = suspicions(source, entry.target, { ...config, syntaxes }).map((suspicion) => suspicion.code);
    if (options.all !== true && reasons.length === 0) continue;
    candidates.push({ source, target: entry.target, reasons });
    if (options.limit !== undefined && candidates.length >= options.limit) break;
  }
  return candidates;
}

export interface VerifyOptions {
  readonly candidates: readonly CheckCandidate[];
  /** The project memory: the verdicts are recorded in it. */
  readonly memory: TranslationMemory;
  readonly config: PipelineConfig;
  /** Translates back into the source language: any engine, DeepL included. */
  readonly translator: Provider;
  readonly judge: Judge;
  /** Called after each judged batch: the caller writes the memory to disk. */
  readonly save: () => Promise<void>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: { readonly done: number; readonly total: number }) => void;
  /** Injected in tests, so that they never really wait on a rate limit. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface VerifySummary {
  readonly checked: number;
  readonly same: number;
  readonly nuance: number;
  readonly different: number;
  /** Not translated back, or not judged. */
  readonly failed: number;
  readonly interrupted: boolean;
}

/** Tries for one batch of reviews, rate limit waits included. */
const MAX_REVIEW_ATTEMPTS = 3;

/**
 * Translates each candidate back into the source language, has the judge compare the original and the
 * back-translation (in the same language, an easier task than across languages), and records the verdicts.
 */
export async function verifyTranslations(options: VerifyOptions): Promise<VerifySummary> {
  const { candidates, config, signal } = options;
  const counts = { checked: 0, same: 0, nuance: 0, different: 0, failed: 0 };
  const done = (interrupted: boolean): VerifySummary => ({ ...counts, interrupted });
  if (candidates.length === 0) return done(false);

  const back = await translateBack(options);
  if (back.interrupted) return done(true);

  const judged = candidates.filter((candidate) => back.translations.has(candidate.target));
  counts.failed += candidates.length - judged.length;

  for (let start = 0; start < judged.length; start += config.translation.batchSize) {
    if (signal?.aborted === true) return done(true);
    const batch = judged.slice(start, start + config.translation.batchSize);
    const items: ReviewItem[] = batch.map((candidate, id) => ({
      id,
      original: candidate.source,
      backTranslation: back.translations.get(candidate.target) ?? "",
    }));
    let reviews: ReadonlyMap<number, Review>;
    try {
      reviews = await review(items, options);
    } catch (error) {
      if (isAborted(signal)) return done(true); // Ctrl+C: the verdicts already saved are kept
      throw error;
    }
    batch.forEach((candidate, id) => {
      const verdict = reviews.get(id);
      const item = items[id];
      if (verdict === undefined || item === undefined) {
        counts.failed++;
        return;
      }
      const check = { ...verdict, backTranslation: item.backTranslation, model: options.judge.model };
      if (options.memory.recordCheck(candidate.source, candidate.target, check)) {
        counts.checked++;
        counts[verdict.verdict]++;
      }
    });
    await options.save();
    options.onProgress?.({ done: Math.min(start + batch.length, judged.length), total: judged.length });
  }
  return done(false);
}

/**
 * The pipeline, the other way: the translations become the texts to translate. Glossary, typography and
 * instructions are left out, since they are written for the other direction; placeholders are still checked.
 */
async function translateBack(options: VerifyOptions) {
  const { config } = options;
  const backConfig: PipelineConfig = {
    ...config,
    sourceLanguage: config.targetLanguage,
    targetLanguage: config.sourceLanguage,
    translation: {
      batchSize: config.translation.batchSize,
      concurrency: config.translation.concurrency,
      glossary: {},
      contextLines: config.translation.contextLines,
      typography: false,
      reuse: false,
    },
    validation: { ...config.validation, glossary: false },
  };
  const targets = [...new Set(options.candidates.map((candidate) => candidate.target))];
  const memory = new TranslationMemory({ languages: backConfig });
  const summary = await translateSegments({
    segments: targets.map((target) => ({ source: target, priority: 0, locations: [{ file: "back-translation" }] })),
    memory,
    provider: options.translator,
    config: backConfig,
    save: async () => {},
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  const translations = new Map(memory.entryList().map((entry) => [entry.source, entry.target]));
  return { translations, interrupted: summary.interrupted };
}

/** One batch of reviews, tried again on an unreadable answer or after a rate limit; empty if it never works. */
async function review(items: readonly ReviewItem[], options: VerifyOptions): Promise<ReadonlyMap<number, Review>> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= MAX_REVIEW_ATTEMPTS; attempt++) {
    try {
      return await options.judge.review({ language: options.config.sourceLanguage, items }, options.signal);
    } catch (error) {
      if (options.signal?.aborted === true) throw error;
      if (error instanceof RateLimitError) await sleep(error.retryAfterMs ?? 1000 * 2 ** attempt);
      else if (!(error instanceof BatchError)) throw error;
    }
  }
  return new Map();
}

/**
 * A function call, not `signal?.aborted` inline: TypeScript would remember the value checked before an await and
 * consider it unchanged, while an interruption can happen at any time.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}
