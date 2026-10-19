import { describe, expect, it } from "vitest";
import { diffSources, similarity } from "../../src/core/diff.js";

describe("similarity", () => {
  it("is 1 for identical texts and 0 for completely different ones", () => {
    expect(similarity("Hello", "Hello")).toBe(1);
    expect(similarity("abc", "xyz")).toBe(0);
    expect(similarity("", "")).toBe(1);
  });

  it("measures the share of characters that did not change", () => {
    expect(similarity("Hello there.", "Hello there!")).toBeCloseTo(11 / 12);
    expect(similarity("kitten", "sitting")).toBeCloseTo(1 - 3 / 7);
  });
});

describe("diffSources", () => {
  it("finds new, removed and slightly changed texts", () => {
    const diff = diffSources(
      ["Hello there!", "Open the door", "Brand new line", "Same"],
      ["Hello there.", "Open the gate now please", "Same", "Gone forever"],
    );
    expect(diff.changed).toEqual([{ from: "Hello there.", to: "Hello there!", similarity: 11 / 12 }]);
    expect(diff.added).toEqual(["Brand new line", "Open the door"]);
    expect(diff.removed).toEqual(["Gone forever", "Open the gate now please"]);
  });

  it("pairs each old text with one new text at most, the most similar first", () => {
    const diff = diffSources(["Hello there!", "Hello there?"], ["Hello there."]);
    expect(diff.changed.map((c) => c.to)).toEqual(["Hello there!"]);
    expect(diff.added).toEqual(["Hello there?"]);
  });

  it("still finds punctuation and case changes when there are too many texts to compare", () => {
    const diff = diffSources(["hello, THERE!", "Open the door"], ["Hello there.", "Open the gate"], {
      maxComparisons: 0,
    });
    expect(diff.changed.map((c) => [c.from, c.to])).toEqual([["Hello there.", "hello, THERE!"]]);
    expect(diff.added).toEqual(["Open the door"]);
  });

  it("accepts a stricter or looser threshold", () => {
    expect(diffSources(["Open the door"], ["Open the gate"], { threshold: 0.5 }).changed).toHaveLength(1);
    expect(diffSources(["Hello there!"], ["Hello there."], { threshold: 0.99 }).changed).toEqual([]);
  });
});
