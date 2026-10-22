import { describe, expect, it } from "vitest";
import { fixTypography } from "../../src/core/typography.js";

const NBSP = "\u{a0}";
const fr = (text: string) => fixTypography(text, "fr");

describe("fixTypography (French)", () => {
  it.each([
    ["Prêt?", `Prêt${NBSP}?`],
    ["Prêt ?", `Prêt${NBSP}?`],
    ["Quoi?!", `Quoi${NBSP}?!`],
    ["Attention: danger; fuyez!", `Attention${NBSP}: danger${NBSP}; fuyez${NBSP}!`],
    ["«Bonjour»", `«${NBSP}Bonjour${NBSP}»`],
    ["« Vraiment? »", `«${NBSP}Vraiment${NBSP}?${NBSP}»`],
    ["Salut {name}!", `Salut {name}${NBSP}!`],
    ["Total : {0:N2}", `Total${NBSP}: {0:N2}`],
  ])("puts a non-breaking space in %j", (text, expected) => {
    expect(fr(text)).toBe(expected);
  });

  it.each([
    "Il est 12:30.",
    "Jour {day}, {hour}:{minute}",
    "Un ratio de 3:1",
    "Voir http://example.com/page?id=1 maintenant",
    "<RGB:1,0,0>Rouge",
    "?",
    "Hein\n?",
    "Déjà\u{202f}?",
    "Points de suspension...",
    "Poisson &unknown; frites",
    "Un &#233;t&#xE9; &nbsp;chaud",
  ])("leaves %j as it is", (text) => {
    expect(fr(text)).toBe(text);
  });

  it("only adds spaces before colons and inside quotes in Canadian French", () => {
    expect(fixTypography("Prêt? Note: «oui»", "fr-CA")).toBe(`Prêt? Note${NBSP}: «${NBSP}oui${NBSP}»`);
  });

  it("does not touch other languages", () => {
    expect(fixTypography("Ready? Yes: «no»", "en")).toBe("Ready? Yes: «no»");
  });
});
