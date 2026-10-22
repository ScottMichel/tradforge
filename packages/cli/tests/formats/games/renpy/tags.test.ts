import { describe, expect, it } from "vitest";
import { findTokens, placeholderPattern } from "../../../../src/core/validation/placeholders.js";

const tokens = (text: string) => findTokens(text, "renpy");

describe("the renpy placeholder syntax", () => {
  it.each([
    ["{b}Bold{/b} and {i}italic{/i}", ["{b}", "{/b}", "{i}", "{/i}"]],
    ["{color=#f00}Red{/color}{size=+10}Big{/size}", ["{color=#f00}", "{/color}", "{size=+10}", "{/size}"]],
    ["Wait{w} more{w=0.5} page{p} next{nw}", ["{w}", "{w=0.5}", "{p}", "{nw}"]],
    ["{a=https://example.com/a?b=1}site{/a}", ["{a=https://example.com/a?b=1}", "{/a}"]],
    ["{fast}{image=icons/star.png}{#menu}", ["{fast}", "{image=icons/star.png}", "{#menu}"]],
    ["Hi [player_name], [mc.name!t] has [items[0]]", ["[player_name]", "[mc.name!t]", "[items[0]]"]],
    ["{{not a tag} and [[not a variable]", ["{{", "[["]],
    ["{{b}", ["{{"]],
    ["A plain sentence: 3 < 4, 100%.", []],
  ])("finds the tokens of %j", (text, expected) => {
    expect(tokens(text)).toEqual(expected);
  });

  it("joins with the other syntaxes in one pattern", () => {
    expect("Hi [name], %s {b}x{/b}".match(placeholderPattern(["renpy", "printf"]))).toEqual([
      "[name]",
      "%s",
      "{b}",
      "{/b}",
    ]);
  });
});
