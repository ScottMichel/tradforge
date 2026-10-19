import { compareCodeUnits } from "./compare.js";
import type { Occurrence, Segment, SourceLocation } from "./types.js";

interface Group {
  priority: number;
  context: string | undefined;
  locations: SourceLocation[];
}

/** Turns raw occurrences into unique segments, ready to be translated. */
export function groupOccurrences(occurrences: readonly Occurrence[]): Segment[] {
  const groups = new Map<string, Group>();

  for (const occurrence of occurrences) {
    const group = groups.get(occurrence.source);
    if (group === undefined) {
      groups.set(occurrence.source, {
        priority: occurrence.priority,
        context: occurrence.context,
        locations: [occurrence.location],
      });
      continue;
    }
    group.locations.push(occurrence.location);
    if (occurrence.priority < group.priority) {
      group.priority = occurrence.priority;
      group.context = occurrence.context;
    }
  }

  return [...groups]
    .map(([source, group]) => ({
      source,
      priority: group.priority,
      locations: group.locations,
      ...(group.context !== undefined ? { context: group.context } : {}),
    }))
    .sort((a, b) => a.priority - b.priority || compareCodeUnits(a.source, b.source));
}
