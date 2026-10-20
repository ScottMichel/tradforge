import { describe, expect, it } from "vitest";
import { ProtectionError, protectPlaceholders, restorePlaceholders } from "../../src/core/protection.js";

const syntaxes = ["braces", "printf", "markup"] as const;

describe("protectPlaceholders / restorePlaceholders", () => {
  it("replaces every placeholder and tag with a numbered tag, and puts them back", () => {
    const original = "Hello {name}, <b>%d</b> new messages";
    const shielded = protectPlaceholders(original, syntaxes);
    expect(shielded.text).not.toMatch(/\{name\}|%d|<b>|<\/b>/);
    expect(shielded.tokens).toHaveLength(4);
    expect(restorePlaceholders(shielded.text, shielded.tokens)).toBe(original);
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
