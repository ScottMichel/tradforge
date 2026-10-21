import { describe, expect, it } from "vitest";
import { ProtectionError, protectPlaceholders, restorePlaceholders } from "../../src/core/protection.js";

const syntaxes = ["braces", "printf", "markup"] as const;

describe("protectPlaceholders / restorePlaceholders", () => {
  it("replaces every placeholder and tag with a numbered tag, in text order, and puts them back", () => {
    const original = "Hello {name}, <b>you</b> have %d new messages";
    const shielded = protectPlaceholders(original, syntaxes);
    expect(shielded.text).toBe('Hello <x id="0"/>, <x id="1"/>you<x id="2"/> have <x id="3"/> new messages');
    expect(shielded.tokens).toEqual(["{name}", "<b>", "</b>", "%d"]);
    expect(restorePlaceholders(shielded.text, shielded.tokens)).toBe(original);
  });

  it("keeps placeholders that touch as one tag, so that an engine cannot put a space between them", () => {
    // A real DeepL run turned "{hour}:{minute}" into "{hour} : {minute}", as French puts a space before a colon.
    const shielded = protectPlaceholders("Day {day}, {hour}:{minute}. HP %d/%d <b>%s</b>", syntaxes);
    expect(shielded.text).toBe('Day <x id="0"/>, <x id="1"/>. HP <x id="2"/> <x id="3"/>');
    expect(shielded.tokens).toEqual(["{day}", "{hour}:{minute}", "%d/%d", "<b>%s</b>"]);
    expect(restorePlaceholders('Jour <x id="0"/>, <x id="1"/>. PV <x id="2"/> <x id="3"/>', shielded.tokens)).toBe(
      "Jour {day}, {hour}:{minute}. PV %d/%d <b>%s</b>",
    );
  });

  it("keeps placeholders apart when a space or a word separates them", () => {
    expect(protectPlaceholders("{a}, {b} and {c}-x-{d}", syntaxes).tokens).toEqual(["{a}", "{b}", "{c}", "{d}"]);
  });

  it("puts placeholders back wherever the translation moved them", () => {
    const shielded = protectPlaceholders("{a} gave {b}", syntaxes);
    const [a, b] = [0, 1].map((id) => `<x id="${shielded.tokens.indexOf(id === 0 ? "{a}" : "{b}")}"/>`);
    expect(restorePlaceholders(`${b} a reçu de ${a}`, shielded.tokens)).toBe("{b} a reçu de {a}");
  });

  it("leaves texts without placeholders unchanged", () => {
    expect(protectPlaceholders("Hello", syntaxes)).toEqual({ text: "Hello", tokens: [] });
  });

  it.each([
    ["Bonjour", /missing/],
    ['Bonjour <x id="0"/> <x id="0"/>', /repeated/],
    ['Bonjour <x id="0"/> <x id="7"/>', /unknown/],
  ])("rejects a translation that lost, repeated or invented a tag: %j", (translation, message) => {
    const { tokens } = protectPlaceholders("Hello {name}", syntaxes);
    expect(() => restorePlaceholders(translation, tokens)).toThrow(ProtectionError);
    expect(() => restorePlaceholders(translation, tokens)).toThrow(message);
  });
});
