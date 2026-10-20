/** An older version of a text and its translation: a hint to keep the same wording. */
export interface PreviousTranslation {
  readonly source: string;
  readonly translation: string;
}

/** One text of a batch. The id links the answer back to the text. */
export interface TranslationItem {
  readonly id: number;
  readonly source: string;
  readonly context?: string;
  readonly previous?: PreviousTranslation;
}

/** A line around the batch, sent for context only: never to translate, never returned. */
export interface ContextLine {
  readonly source: string;
  /** Known when the line is already translated: it keeps the tone and the form of address consistent. */
  readonly translation?: string;
}

export interface TranslationRequest {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly items: readonly TranslationItem[];
  /** Project instructions (tone, audience...). */
  readonly instructions?: string;
  readonly glossary?: Readonly<Record<string, string>>;
  /** Lines just before and just after the items, in the same file. */
  readonly surrounding?: { readonly before: readonly ContextLine[]; readonly after: readonly ContextLine[] };
}

/**
 * Port: a translation engine. It only translates; checking the result is the job of the validation.
 * The answer may lack some ids (the model skipped them): the caller decides what to do.
 */
export interface Provider {
  /** Recorded in the memory with each translation. */
  readonly model: string;
  /**
   * True for engines that cannot be told to keep placeholders (such as DeepL): the pipeline then replaces them
   * with <x id="n"/> tags before the request, and puts them back after.
   */
  readonly protectPlaceholders?: boolean;
  readonly translateBatch: (request: TranslationRequest, signal?: AbortSignal) => Promise<ReadonlyMap<number, string>>;
}

/** The engine cannot be used at all (not running, model missing...): stop and explain. */
export class ProviderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderUnavailableError";
  }
}

/**
 * The engine asks to slow down (HTTP 429). The batch itself is fine: the pipeline waits, then sends it again as it
 * is, without counting an attempt.
 */
export class RateLimitError extends Error {
  /** The delay the server asked for, when it said. */
  readonly retryAfterMs: number | undefined;

  constructor(message: string, retryAfterMs?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** This batch failed (unreadable answer, timeout...): retrying with smaller batches may work. */
export class BatchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BatchError";
  }
}
