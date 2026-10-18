import { describe, expect, it } from "vitest";
import { findTokens, removeTokens } from "../../../src/core/validation/placeholders.js";

describe("findTokens", () => {
  it("finds brace placeholders", () => {
    expect(findTokens("Hi {name}, {0} and {} but not { this }", "braces")).toEqual(["{name}", "{0}", "{}"]);
  });

  it("finds printf placeholders, positional ones and %% included", () => {
    expect(findTokens("%s %d %1$s %5.2f %-3i %%", "printf")).toEqual(["%s", "%d", "%1$s", "%5.2f", "%-3i", "%%"]);
  });

  it("does not take a plain percent sign for a placeholder", () => {
    expect(findTokens("100% sure, 50 % off", "printf")).toEqual([]);
  });

  it("finds markup tags, game tags included", () => {
    expect(findTokens("<b>Hi</b><br/> <RGB:1,0,0>Red <LINE> if a < b", "markup")).toEqual([
      "<b>",
      "</b>",
      "<br/>",
      "<RGB:1,0,0>",
      "<LINE>",
    ]);
  });
});

describe("removeTokens", () => {
  it("removes the tokens of the given syntaxes only", () => {
    expect(removeTokens("Hi {name}, %d <b>x</b>", ["braces", "markup"])).toBe("Hi  , %d  x ");
  });
});
