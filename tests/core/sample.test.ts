import { describe, expect, it } from "vitest";
import { sampleSegments } from "../../src/core/sample.js";
import type { Segment } from "../../src/core/types.js";

const segment = (source: string, file = "ui.json"): Segment => ({ source, priority: 0, locations: [{ file }] });

const many = (count: number, file = "ui.json") =>
  Array.from({ length: count }, (_, i) => segment(`Text ${String(i).padStart(3, "0")}`, file));

describe("sampleSegments", () => {
  it("keeps everything when the project is smaller than the sample", () => {
    const segments = many(5);
    expect(sampleSegments(segments, 10, ["braces"])).toEqual(segments);
  });

  it("takes texts spread over the whole project, in their order, and always the same ones", () => {
    const segments = [...many(50, "a.json"), ...many(50, "b.json")];
    const sample = sampleSegments(segments, 10, ["braces"]);
    expect(sample).toHaveLength(10);
    expect(sample).toEqual(sampleSegments(segments, 10, ["braces"]));
    expect(new Set(sample.map((s) => s.locations[0]?.file))).toEqual(new Set(["a.json", "b.json"]));
    const positions = sample.map((s) => segments.indexOf(s));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("gives a quarter of the places to texts with placeholders, where engines fail most", () => {
    const plain = many(96);
    const withPlaceholders = ["Hi {name}", "{count} items", "Day {day}", "Bye {name}"].map((s) => segment(s));
    const segments = [...plain.slice(0, 48), ...withPlaceholders, ...plain.slice(48)];
    const sample = sampleSegments(segments, 8, ["braces"]);
    expect(sample).toHaveLength(8);
    expect(sample.filter((s) => s.source.includes("{"))).toHaveLength(2);
  });

  it("takes every text with placeholders when there are fewer than a quarter", () => {
    const segments = [...many(40), segment("Hi {name}")];
    expect(sampleSegments(segments, 20, ["braces"]).filter((s) => s.source.includes("{"))).toHaveLength(1);
  });
});
