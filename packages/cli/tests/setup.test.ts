import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("project", () => {
  it("should have a version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
