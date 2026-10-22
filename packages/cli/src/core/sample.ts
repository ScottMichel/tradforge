import type { Segment } from "./types.js";
import { findTokens, type PlaceholderSyntax } from "./validation/placeholders.js";

/** Share of the sample kept for texts with placeholders: the texts that make engines fail most. */
const PLACEHOLDER_SHARE = 0.25;

/**
 * A sample of the project to compare engines on: texts spread evenly over the files, a quarter of them with
 * placeholders when there are some. No randomness: the same project always gives the same sample, so that two
 * comparisons can be compared too. The texts keep their order.
 */
export function sampleSegments(
  segments: readonly Segment[],
  size: number,
  syntaxes: readonly PlaceholderSyntax[],
): Segment[] {
  if (segments.length <= size) return [...segments];
  const hasPlaceholders = (segment: Segment) =>
    syntaxes.some((syntax) => findTokens(segment.source, syntax).length > 0);

  const withPlaceholders = segments.filter(hasPlaceholders);
  const chosen = new Set(
    evenly(withPlaceholders, Math.min(withPlaceholders.length, Math.floor(size * PLACEHOLDER_SHARE))),
  );
  const others = segments.filter((segment) => !chosen.has(segment));
  for (const segment of evenly(others, size - chosen.size)) chosen.add(segment);
  return segments.filter((segment) => chosen.has(segment));
}

/** count items spread evenly over the list: the middle of each of count equal slices. */
function evenly<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= items.length) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor(((i + 0.5) * items.length) / count)]).filter(
    (item): item is T => item !== undefined,
  );
}
