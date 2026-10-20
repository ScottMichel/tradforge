import { describe, expect, it } from "vitest";
import { reuseTranslation } from "../../src/core/reuse.js";

describe("reuseTranslation", () => {
  it.each([
    ["Quit game", "Quit game.", "Quitter le jeu", "Quitter le jeu."],
    ["Hello there.", "Hello there!", "Bonjour.", "Bonjour!"],
    ["Ready?", "Ready", "Prêt\u{a0}?", "Prêt"],
    ["- Take it", "Take it", "- Prends-le", "Prends-le"],
    ["Wait", "  Wait...", "Attends", "  Attends..."],
    ["Yes", "Yes!", "¡Sí", "¡Sí!"],
    ["Quit game", "Quit game.", "[fr] Quit game", "[fr] Quit game."],
  ])("copies the translation when only the punctuation around %j changed", (from, to, translation, expected) => {
    expect(reuseTranslation(from, to, translation)).toBe(expected);
  });

  it.each([
    ["Open the door", "Open the doors", "Ouvrir la porte"],
    ["Hello there", "hello there", "Bonjour"],
    ["...", "!!!", "..."],
  ])("refuses when the words changed: %j → %j", (from, to, translation) => {
    expect(reuseTranslation(from, to, translation)).toBeUndefined();
  });
});
