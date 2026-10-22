import { describe, expect, it } from "vitest";
import { STEPS, stepFromHash } from "../src/renderer/steps.js";

describe("stepFromHash", () => {
  it("reads the step from the address", () => {
    expect(STEPS).toEqual(["project", "settings", "translate", "review"]);
    for (const step of STEPS) expect(stepFromHash(`#${step}`)).toBe(step);
  });

  it("starts with the project when the address names no known step", () => {
    expect(stepFromHash("")).toBe("project");
    expect(stepFromHash("#")).toBe("project");
    expect(stepFromHash("#elsewhere")).toBe("project");
    expect(stepFromHash("#constructor")).toBe("project");
  });
});
