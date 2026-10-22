import type { Verdict } from "./provider.js";

/** Exact place where a text appears in a source file. */
export interface SourceLocation {
  /** File path, relative to the root of the project being translated. */
  readonly file: string;
  /** Key of the text inside the file, when the format has keys (JSON). */
  readonly key?: string;
  /** 1-based line of the text, when the format has no keys (Lua). */
  readonly line?: number;
}

/** A text found by a reader, at one location. */
export interface Occurrence {
  readonly source: string;
  readonly location: SourceLocation;
  /** Hint for the translator: where and how the text is used. */
  readonly context?: string;
  /** Lower value = translated first. */
  readonly priority: number;
  /**
   * Texts that belong together (a conversation, a menu), e.g. "dialogues.json#bob".
   * The pipeline keeps a group in one batch whenever it can.
   */
  readonly group?: string;
}

/** A unique text to translate, with every location where it appears. */
export interface Segment {
  readonly source: string;
  readonly context?: string;
  readonly priority: number;
  readonly locations: readonly SourceLocation[];
  /** Group of the first occurrence. */
  readonly group?: string;
}

/**
 * Who produced the translation. machine: a model. reviewed: a human (never overwritten by a model).
 * Whether a source is still used by the project ("stale") is derived from the current sources, not stored.
 */
export type TranslationStatus = "machine" | "reviewed";

/** One entry of the translation memory. */
export interface TranslationEntry {
  readonly source: string;
  readonly target: string;
  readonly status: TranslationStatus;
  readonly model?: string;
  /** ISO 8601 date of the last change. */
  readonly updatedAt: string;
  /** The back-translation check of this very translation; dropped when the translation changes. */
  readonly check?: TranslationCheck;
}

/** What a back-translation said about a translation. */
export interface TranslationCheck {
  readonly verdict: Verdict;
  readonly note: string;
  /** The translation translated back into the source language. */
  readonly backTranslation: string;
  /** The engine that judged. */
  readonly model: string;
  /** ISO 8601 date of the check. */
  readonly checkedAt: string;
}

/** A source the model could not translate correctly. */
export interface FailedTranslation {
  readonly source: string;
  /** Why the last attempt was rejected (validation issues, unreadable answer...). */
  readonly reason: string;
  readonly attempts: number;
  readonly model?: string;
  /** ISO 8601 date of the last attempt. */
  readonly updatedAt: string;
}
