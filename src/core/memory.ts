import { compareCodeUnits } from "./compare.js";
import type { FailedTranslation, TranslationEntry } from "./types.js";

export interface MemoryLanguages {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
}

export interface MemoryOptions {
  readonly languages: MemoryLanguages;
  readonly entries?: Iterable<TranslationEntry>;
  readonly failures?: Iterable<FailedTranslation>;
  /** Injected so that tests get predictable dates. */
  readonly clock?: () => Date;
}

/** saved: the translation was stored. kept-reviewed: a human translation was already there and wins. */
export type RecordOutcome = "saved" | "kept-reviewed";

export type ImportOutcome = "added" | "updated" | "skipped";

export interface MemoryStats {
  /** Unique sources currently in the project. */
  readonly total: number;
  readonly translated: number;
  /** Part of translated: checked by a human. */
  readonly reviewed: number;
  /** Not translated, and the last attempt failed. */
  readonly failed: number;
  /** Not translated, never attempted. */
  readonly pending: number;
  /** Translations whose source is no longer in the project. */
  readonly stale: number;
}

/**
 * Translations indexed by source text, plus the log of failed attempts.
 * Pure in-memory state: reading and writing files is the job of the storage adapter.
 */
export class TranslationMemory {
  readonly languages: MemoryLanguages;
  private readonly entries = new Map<string, TranslationEntry>();
  private readonly failures = new Map<string, FailedTranslation>();
  private readonly clock: () => Date;

  constructor(options: MemoryOptions) {
    this.languages = options.languages;
    this.clock = options.clock ?? (() => new Date());
    for (const entry of options.entries ?? []) this.entries.set(entry.source, entry);
    for (const failure of options.failures ?? []) this.failures.set(failure.source, failure);
  }

  get(source: string): TranslationEntry | undefined {
    return this.entries.get(source);
  }

  getFailure(source: string): FailedTranslation | undefined {
    return this.failures.get(source);
  }

  /** Stores a model translation, unless a human already reviewed this source. */
  recordMachine(source: string, target: string, model: string): RecordOutcome {
    if (this.entries.get(source)?.status === "reviewed") return "kept-reviewed";
    this.entries.set(source, { source, target, status: "machine", model, updatedAt: this.now() });
    this.failures.delete(source);
    return "saved";
  }

  /** Logs a failed attempt. The reason and model of the last attempt are kept. */
  recordFailure(source: string, reason: string, model?: string): void {
    const attempts = (this.failures.get(source)?.attempts ?? 0) + 1;
    this.failures.set(source, {
      source,
      reason,
      attempts,
      ...(model !== undefined ? { model } : {}),
      updatedAt: this.now(),
    });
  }

  /** Stores a human translation (status reviewed). With keep, an existing translation is left as is. */
  importTranslation(source: string, target: string, options: { readonly keep?: boolean } = {}): ImportOutcome {
    const existing = this.entries.has(source);
    if (existing && options.keep === true) return "skipped";
    this.entries.set(source, { source, target, status: "reviewed", updatedAt: this.now() });
    this.failures.delete(source);
    return existing ? "updated" : "added";
  }

  /** Every entry, sorted by source (UTF-16 code units) for reproducible files. */
  entryList(): TranslationEntry[] {
    return sortBySource([...this.entries.values()]);
  }

  failureList(): FailedTranslation[] {
    return sortBySource([...this.failures.values()]);
  }

  /** Sources that have a translation but are no longer in the project, sorted. */
  staleSources(currentSources: Iterable<string>): string[] {
    const current = new Set(currentSources);
    return this.entryList()
      .map((entry) => entry.source)
      .filter((source) => !current.has(source));
  }

  stats(currentSources: Iterable<string>): MemoryStats {
    const current = new Set(currentSources);
    let translated = 0;
    let reviewed = 0;
    let failed = 0;
    for (const source of current) {
      const entry = this.entries.get(source);
      if (entry !== undefined) {
        translated++;
        if (entry.status === "reviewed") reviewed++;
      } else if (this.failures.has(source)) {
        failed++;
      }
    }
    const stale = [...this.entries.keys()].filter((source) => !current.has(source)).length;
    return { total: current.size, translated, reviewed, failed, pending: current.size - translated - failed, stale };
  }

  private now(): string {
    return this.clock().toISOString();
  }
}

function sortBySource<T extends { readonly source: string }>(items: T[]): T[] {
  return items.sort((a, b) => compareCodeUnits(a.source, b.source));
}
