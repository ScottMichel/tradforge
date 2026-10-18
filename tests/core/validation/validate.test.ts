import { describe, expect, it } from "vitest";
import { validateTranslation, type ValidationOptions } from "../../../src/core/validation/validate.js";

const issues = (source: string, target: string, options?: Partial<ValidationOptions>) =>
  validateTranslation({ source, target }, options);

const codes = (source: string, target: string, options?: Partial<ValidationOptions>) =>
  issues(source, target, options).map((issue) => issue.code);

describe("validateTranslation", () => {
  it("accepts a correct translation", () => {
    expect(issues("Hello {name}, you have %d coins.", "Bonjour {name}, vous avez %d pièces.")).toEqual([]);
  });

  it("accepts placeholders in a different order", () => {
    expect(issues("%1$s gave %2$s a <b>gift</b>", "%2$s a reçu un <b>cadeau</b> de %1$s")).toEqual([]);
  });

  it("reports an empty translation, and nothing else", () => {
    expect(codes("Hello {name}\n", "  ")).toEqual(["empty"]);
  });

  it("reports a missing placeholder", () => {
    const [issue] = issues("Hello {name}, %d new", "Bonjour, %d nouveaux");
    expect(issue?.code).toBe("placeholder-missing");
    expect(issue?.message).toContain("{name}");
  });

  it("reports a placeholder invented by the model", () => {
    const [issue] = issues("Go back to town", "Retournez en {town}");
    expect(issue?.code).toBe("placeholder-invented");
    expect(issue?.message).toContain("{town}");
  });

  it("reports a placeholder repeated more often than in the source", () => {
    expect(codes("{n} item", "{n} {n} objet")).toEqual(["placeholder-invented"]);
  });

  it("only checks the enabled placeholder syntaxes", () => {
    expect(codes("You have %d coins", "Vous avez des pièces", { placeholders: ["braces"] })).toEqual([]);
  });

  it("reports changed markup", () => {
    const [issue] = issues("<b>Warning</b>", "Attention</i>");
    expect(issue?.code).toBe("markup-changed");
    expect(issue?.message).toContain("<b>");
    expect(issue?.message).toContain("</i>");
  });

  it("reports a different number of line breaks, whatever their style", () => {
    expect(codes("Line one\nLine two", "Ligne un Ligne deux")).toEqual(["line-breaks-changed"]);
    expect(codes("Line one\r\nLine two", "Ligne un\nLigne deux")).toEqual([]);
  });

  it("reports lost action markers", () => {
    expect(codes("*sighs* Fine.", "Bien.")).toEqual(["markers-changed"]);
  });

  it("reports changed leading or trailing spaces", () => {
    expect(codes("Score: ", "Score :")).toEqual(["whitespace-changed"]);
    expect(codes("  Name", "Nom")).toEqual(["whitespace-changed"]);
  });

  it("reports an untranslated sentence of four words or more", () => {
    expect(codes("Welcome to the camp", "Welcome to the camp")).toEqual(["untranslated"]);
  });

  it("accepts short texts left as they are, placeholders not counted as words", () => {
    expect(codes("OK", "OK")).toEqual([]);
    expect(codes("Hello {player_name} and {friend}", "Hello {player_name} and {friend}")).toEqual([]);
  });

  it("reports a translation that is far too long", () => {
    // Limit for a 3-character source: 3 × 2.2 + 25 = 31.6, so 31 characters.
    expect(codes("Yes", "x".repeat(31))).toEqual([]);
    expect(codes("Yes", "x".repeat(32))).toEqual(["too-long"]);
  });

  it("reports every problem, in a fixed order", () => {
    expect(codes("Hello {name}\n", "Bonjour {nom}")).toEqual([
      "placeholder-missing",
      "placeholder-invented",
      "line-breaks-changed",
      "whitespace-changed",
    ]);
  });
});
