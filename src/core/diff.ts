import { compareCodeUnits } from "./compare.js";

export interface ChangedSource {
  /** The text the memory knows. */
  readonly from: string;
  /** The text now in the project. */
  readonly to: string;
  /** 0 to 1: share of characters that did not change. */
  readonly similarity: number;
}

export interface SourceDiff {
  /** In the project, not in the memory, and not similar to a removed text. Sorted. */
  readonly added: string[];
  /** In the memory, no longer in the project, and not similar to a new text. Sorted. */
  readonly removed: string[];
  /** A removed text and the new text that most likely replaces it, most similar first. */
  readonly changed: ChangedSource[];
}

export interface DiffOptions {
  /** Minimum similarity for a removed and a new text to count as one changed text. Default: 0.8. */
  readonly threshold?: number;
  /** Above this many pairs, only punctuation and case changes are looked for. Default: 250,000. */
  readonly maxComparisons?: number;
}

/**
 * Compares the sources of the project with those of the memory.
 * A small edit (punctuation, one word) shows as "changed": its old translation is a good starting point.
 */
export function diffSources(
  current: Iterable<string>,
  known: Iterable<string>,
  options: DiffOptions = {},
): SourceDiff {
  const threshold = options.threshold ?? 0.8;
  const maxComparisons = options.maxComparisons ?? 250_000;
  const currentSet = new Set(current);
  const knownSet = new Set(known);
  const added = [...currentSet].filter((source) => !knownSet.has(source));
  const removed = [...knownSet].filter((source) => !currentSet.has(source));

  const candidates =
    added.length * removed.length <= maxComparisons
      ? similarPairs(added, removed, threshold)
      : sameLetters(added, removed);

  // Greedy: the most similar pairs first, each text used once. Ties are broken by text, for a stable result.
  candidates.sort(
    (a, b) => b.similarity - a.similarity || compareCodeUnits(a.to, b.to) || compareCodeUnits(a.from, b.from),
  );
  const changed: ChangedSource[] = [];
  const usedNew = new Set<string>();
  const usedOld = new Set<string>();
  for (const pair of candidates) {
    if (usedNew.has(pair.to) || usedOld.has(pair.from)) continue;
    changed.push(pair);
    usedNew.add(pair.to);
    usedOld.add(pair.from);
  }

  return {
    added: added.filter((source) => !usedNew.has(source)).sort(compareCodeUnits),
    removed: removed.filter((source) => !usedOld.has(source)).sort(compareCodeUnits),
    changed,
  };
}

/** Every pair above the threshold. Pairs whose lengths alone rule them out are skipped. */
function similarPairs(added: readonly string[], removed: readonly string[], threshold: number): ChangedSource[] {
  const pairs: ChangedSource[] = [];
  for (const to of added) {
    for (const from of removed) {
      // The similarity can never exceed shorter length / longer length.
      if (Math.min(to.length, from.length) / Math.max(to.length, from.length, 1) < threshold) continue;
      const score = similarity(from, to);
      if (score >= threshold) pairs.push({ from, to, similarity: score });
    }
  }
  return pairs;
}

/** Cheap fallback for large diffs: texts that only differ by punctuation, spaces or case. */
function sameLetters(added: readonly string[], removed: readonly string[]): ChangedSource[] {
  const byKey = new Map<string, string[]>();
  for (const from of removed) {
    const key = lettersOnly(from);
    byKey.set(key, [...(byKey.get(key) ?? []), from]);
  }
  return added.flatMap((to) =>
    (byKey.get(lettersOnly(to)) ?? []).map((from) => ({ from, to, similarity: similarity(from, to) })),
  );
}

function lettersOnly(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** 1 − (Levenshtein distance / length of the longer text). */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

/** Minimum number of single-character insertions, deletions or substitutions. Two rows: O(min) memory. */
function levenshtein(a: string, b: string): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let previous = Array.from({ length: short.length + 1 }, (_, index) => index);
  for (let i = 1; i <= long.length; i++) {
    const current = [i];
    for (let j = 1; j <= short.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (long[i - 1] === short[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[short.length] ?? 0;
}
