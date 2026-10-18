import { compareCodeUnits } from "../core/compare.js";
import type { TranslationMemory } from "../core/memory.js";
import { CsvError, formatCsv, parseCsv } from "./csv.js";

/** machine / reviewed: translated. stale: no longer in the project. failed / pending: not translated yet. */
export type ReviewStatus = "machine" | "reviewed" | "stale" | "failed" | "pending";

export interface ImportResult {
  readonly added: number;
  readonly updated: number;
  /** Already translated, and the import was asked to keep existing translations. */
  readonly skipped: number;
  /** Same translation as in the memory, not marked reviewed: nothing to do. */
  readonly unchanged: number;
  /** No translation in the row. */
  readonly empty: number;
}

const HEADER = ["source", "target", "status"];

/**
 * A CSV file to review or complete the translations: one row per translation
 * and per untranslated source of the project, sorted by source.
 */
export function exportReviewCsv(memory: TranslationMemory, currentSources: Iterable<string>): string {
  const current = new Set(currentSources);
  const sources = new Set([...memory.entryList().map((entry) => entry.source), ...current]);
  const rows = [...sources]
    .sort(compareCodeUnits)
    .map((source) => [source, memory.get(source)?.target ?? "", reviewStatus(memory, source, current)]);
  return formatCsv([HEADER, ...rows]);
}

function reviewStatus(memory: TranslationMemory, source: string, current: ReadonlySet<string>): ReviewStatus {
  const entry = memory.get(source);
  if (entry === undefined) return memory.getFailure(source) !== undefined ? "failed" : "pending";
  return current.has(source) ? entry.status : "stale";
}

/**
 * Imports a reviewed CSV file: changed or new translations become "reviewed".
 * A row identical to the memory changes nothing, unless its status column says "reviewed".
 */
export function importReviewCsv(
  memory: TranslationMemory,
  csv: string,
  options: { readonly keep?: boolean } = {},
): ImportResult {
  const [header = [], ...rows] = parseCsv(csv);
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index === -1) throw new CsvError(`missing column "${name}" in the header`);
    return index;
  };
  const sourceColumn = column("source");
  const targetColumn = column("target");
  const statusColumn = header.indexOf("status");

  const result = { added: 0, updated: 0, skipped: 0, unchanged: 0, empty: 0 };
  for (const row of rows) {
    if (row.every((cell) => cell === "")) continue;
    const source = row[sourceColumn] ?? "";
    const target = row[targetColumn] ?? "";
    if (target === "") {
      result.empty++;
      continue;
    }
    const existing = memory.get(source);
    const approved = statusColumn !== -1 && row[statusColumn] === "reviewed";
    if (existing?.target === target && (existing.status === "reviewed" || !approved)) {
      result.unchanged++;
      continue;
    }
    result[memory.importTranslation(source, target, options)]++;
  }
  return result;
}
