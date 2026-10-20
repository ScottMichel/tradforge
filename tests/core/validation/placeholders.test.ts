import { describe, expect, it } from "vitest";
import {
  findTokens,
  PLACEHOLDER_SYNTAXES,
  placeholderPattern,
  removeTokens,
} from "../../../src/core/validation/placeholders.js";

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

describe("findTokens: numbered and bracket placeholders", () => {
  it("finds numbered placeholders, without taking printf ones twice", () => {
    expect(findTokens("%1 gave %2 to %1, %1$s stays printf, 100% sure", "positional")).toEqual(["%1", "%2", "%1"]);
  });

  it("finds bracket tags with a value and closing bracket tags, not words in brackets", () => {
    expect(findTokens("[img=music] Hi [color=255,0,0]you[/color] [Note] [b]", "bbcode")).toEqual([
      "[img=music]",
      "[color=255,0,0]",
      "[/color]",
    ]);
  });
});

describe("placeholderPattern", () => {
  it("matches the tokens of several syntaxes at once", () => {
    expect("Hi {name}, %1 <b>x</b> [img=a]".match(placeholderPattern(PLACEHOLDER_SYNTAXES))).toEqual([
      "{name}",
      "%1",
      "<b>",
      "</b>",
      "[img=a]",
    ]);
  });
});

describe("removeTokens", () => {
  it("removes the tokens of the given syntaxes only", () => {
    expect(removeTokens("Hi {name}, %d <b>x</b>", ["braces", "markup"])).toBe("Hi  , %d  x ");
  });
});
