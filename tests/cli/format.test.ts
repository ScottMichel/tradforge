import { describe, expect, it } from "vitest";
import { formatCount, formatDuration } from "../../src/cli/format.js";

describe("formatDuration", () => {
  it.each([
    [0, "0 s"],
    [45_400, "45 s"],
    [12 * 60_000 + 20_000, "12 min"],
    [65 * 60_000, "1 h 05 min"],
    [17 * 3_600_000 + 3 * 60_000, "17 h 03 min"],
  ])("formats %d ms as %j", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("formatCount", () => {
  it("groups thousands, whatever the machine locale", () => {
    expect(formatCount(98_000)).toBe("98,000");
    expect(formatCount(7)).toBe("7");
  });
});
