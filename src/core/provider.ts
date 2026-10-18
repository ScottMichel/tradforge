/** One text of a batch. The id links the answer back to the text. */
export interface TranslationItem {
  readonly id: number;
  readonly source: string;
  readonly context?: string;
}

export interface TranslationRequest {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly items: readonly TranslationItem[];
  /** Project instructions (tone, audience...). */
  readonly instructions?: string;
  readonly glossary?: Readonly<Record<string, string>>;
}

/**
 * Port: a translation engine. It only translates; checking the result is the job of the validation.
 * The answer may lack some ids (the model skipped them): the caller decides what to do.
 */
export interface Provider {
  /** Recorded in the memory with each translation. */
  readonly model: string;
  readonly translateBatch: (request: TranslationRequest, signal?: AbortSignal) => Promise<ReadonlyMap<number, string>>;
}

/** The engine cannot be used at all (not running, model missing...): stop and explain. */
export class ProviderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderUnavailableError";
  }
}

/** This batch failed (unreadable answer, timeout...): retrying with smaller batches may work. */
export class BatchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BatchError";
  }
}
