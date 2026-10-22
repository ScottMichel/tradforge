import type { Segment } from "../core/types.js";
import { UsageError } from "./command.js";

/** --limit: a positive integer, or nothing. */
export function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(value)) throw new UsageError("--limit must be a positive integer");
  return Number(value);
}

/** --only: the segments found in this file, or in the files of this folder. */
export function onlyIn(segments: readonly Segment[], only: string): Segment[] {
  const target = only.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  return segments.filter((segment) =>
    segment.locations.some((location) => location.file === target || location.file.startsWith(`${target}/`)),
  );
}
