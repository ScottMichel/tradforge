import type { Occurrence, Segment, SourceLocation } from "./types.js";

interface Group {
  priority: number;
  context: string | undefined;
  group: string | undefined;
  locations: SourceLocation[];
  /** Position of the first occurrence: texts keep the order of the files they come from. */
  order: number;
}

/**
 * Turns raw occurrences into unique segments, ready to be translated.
 * Sorted by priority, then in order of first appearance: lines of a conversation stay next to each other,
 * so batches carry their context. The order is deterministic: files are read in sorted order.
 */
export function groupOccurrences(occurrences: readonly Occurrence[]): Segment[] {
  const groups = new Map<string, Group>();

  occurrences.forEach((occurrence, order) => {
    const group = groups.get(occurrence.source);
    if (group === undefined) {
      groups.set(occurrence.source, {
        priority: occurrence.priority,
        context: occurrence.context,
        group: occurrence.group,
        locations: [occurrence.location],
        order,
      });
      return;
    }
    group.locations.push(occurrence.location);
    if (occurrence.priority < group.priority) {
      group.priority = occurrence.priority;
      group.context = occurrence.context;
    }
  });

  return [...groups]
    .sort(([, a], [, b]) => a.priority - b.priority || a.order - b.order)
    .map(([source, group]) => ({
      source,
      priority: group.priority,
      locations: group.locations,
      ...(group.context !== undefined ? { context: group.context } : {}),
      ...(group.group !== undefined ? { group: group.group } : {}),
    }));
}
