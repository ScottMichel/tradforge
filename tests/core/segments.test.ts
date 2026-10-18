import { describe, expect, it } from "vitest";
import { groupOccurrences } from "../../src/core/segments.js";
import type { Occurrence } from "../../src/core/types.js";

const occ = (source: string, file: string, priority = 1, context?: string): Occurrence => ({
  source,
  priority,
  location: { file },
  ...(context !== undefined ? { context } : {}),
});

describe("groupOccurrences", () => {
  it("merges identical texts and keeps all their locations", () => {
    const segments = groupOccurrences([occ("Hello", "a.json"), occ("Hello", "b.json")]);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.locations.map((l) => l.file)).toEqual(["a.json", "b.json"]);
  });

  it("keeps the highest priority and its context", () => {
    const [segment] = groupOccurrences([occ("Hi", "a", 5, "menu"), occ("Hi", "b", 1, "dialogue")]);
    expect(segment?.priority).toBe(1);
    expect(segment?.context).toBe("dialogue");
  });

  it("sorts by priority, then alphabetically", () => {
    const sources = groupOccurrences([occ("B", "f", 2), occ("C", "f", 1), occ("A", "f", 2)]).map((s) => s.source);
    expect(sources).toEqual(["C", "A", "B"]);
  });

    it("sorts by code unit, whatever the machine locale", () => {
    const sources = groupOccurrences([occ("b", "f"), occ("B", "f"), occ("a", "f")]).map((s) => s.source);
    expect(sources).toEqual(["B", "a", "b"]);
  });

  it("keeps texts that only differ by case or punctuation apart", () => {
    expect(groupOccurrences([occ("Yes.", "f"), occ("Yes?", "f"), occ("yes.", "f")])).toHaveLength(3);
  });

  it("returns an empty list when there is nothing", () => {
    expect(groupOccurrences([])).toEqual([]);
  });
});