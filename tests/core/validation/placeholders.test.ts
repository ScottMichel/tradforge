import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLACEHOLDER_SYNTAXES,
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

  it("finds the named placeholders of Python, common in gettext catalogs", () => {
    expect(findTokens("%(count)d files in %(folder_name)s, %(ratio).1f%%", "printf")).toEqual([
      "%(count)d",
      "%(folder_name)s",
      "%(ratio).1f",
      "%%",
    ]);
  });

  it("finds the named placeholders of Ruby, common in Rails files", () => {
    expect(findTokens("%{count} bars for %{user.name}", "printf")).toEqual(["%{count}", "%{user.name}"]);
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

describe("findTokens: subtitle codes", () => {
  it("finds ASS override codes, not braces without a backslash", () => {
    expect(findTokens("{\\an8}{\\i1}Hi{\\i0} {\\c&H00FFFF&} {\\pos(320,50)} {name} {} { \\ }", "ass")).toEqual([
      "{\\an8}",
      "{\\i1}",
      "{\\i0}",
      "{\\c&H00FFFF&}",
      "{\\pos(320,50)}",
    ]);
  });

  it("finds WebVTT inline timestamps, not other numbers in angle brackets", () => {
    expect(findTokens("<00:00:12.800>Hi <01:02.500>you <123:00:00.000> <5> <00:00:12,800>", "timestamp")).toEqual([
      "<00:00:12.800>",
      "<01:02.500>",
      "<123:00:00.000>",
    ]);
  });
});

describe("findTokens: Paradox localisation", () => {
  it.each([
    ["The smith of $PROVINCE$ asks for §Ycoal§!.", ["$PROVINCE$", "§Y", "§!"]],
    ["Costs $VALUE|=+0$ and $VAL|%2+$, not $$ dollars", ["$VALUE|=+0$", "$VAL|%2+$"]],
    ["Buy coal (£gold£ 10), £icon_manpower|1 men, 5¤", ["£gold£", "£icon_manpower|1", "¤"]],
    ["Pay @gold_icon! now, [Root.GetName] at [GetDateText]", ["@gold_icon!", "[Root.GetName]", "[GetDateText]"]],
    ["#bold Strong#! words, issue #3", ["#bold", "#!"]],
  ])("finds the codes of %j", (text, tokens) => {
    expect(findTokens(text, "paradox")).toEqual(tokens);
  });

  it("is not a default syntax: elsewhere, a word in brackets is text to translate", () => {
    expect(DEFAULT_PLACEHOLDER_SYNTAXES).not.toContain("paradox");
    expect(PLACEHOLDER_SYNTAXES).toContain("paradox");
  });
});

describe("findTokens: RimWorld", () => {
  it("finds grammar symbols and the rule head at the start of a text", () => {
    expect(findTokens("[PAWN_nameDef] waves at [RECIPIENT_labelShort].", "rimworld")).toEqual([
      "[PAWN_nameDef]",
      "[RECIPIENT_labelShort]",
    ]);
    expect(findTokens("r_logentry(p=2)->[PAWN_nameDef] sings", "rimworld")).toEqual([
      "r_logentry(p=2)->",
      "[PAWN_nameDef]",
    ]);
    expect(findTokens("A [ b ] c, and an arrow -> here", "rimworld")).toEqual([]);
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
