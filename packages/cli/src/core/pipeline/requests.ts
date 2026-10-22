import type { TranslationMemory } from "../memory.js";
import type { PipelineConfig } from "../pipeline.js";
import type { ContextLine, PreviousTranslation, TranslationRequest } from "../provider.js";
import type { Segment } from "../types.js";

/**
 * What a run sends, and nothing that sends it: batches that keep each conversation whole, the lines around a batch
 * given as context, and the request built from them. The dry run plans its estimates with the same functions.
 */

/** What building a request needs. */
export interface RequestContext {
  readonly config: PipelineConfig;
  readonly memory: TranslationMemory;
  readonly previous: ReadonlyMap<string, PreviousTranslation>;
  readonly neighbours: Neighbours;
}

/** Ids are positions in the group: the answer is matched back by position. */
export function buildRequest(
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

/** The texts of each file in order, to find the lines around a batch. */
export class Neighbours {
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
export function chunkByGroup(segments: readonly Segment[], size: number): Segment[][] {
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

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}
