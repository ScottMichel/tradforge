import { describe, expect, it } from "vitest";
import { suspicions } from "../../src/core/suspicion.js";

const enFr = { sourceLanguage: "en", targetLanguage: "fr", syntaxes: ["braces", "printf"] as const };
const codes = (source: string, target: string, languages = enFr) =>
  suspicions(source, target, languages).map((suspicion) => suspicion.code);

describe("suspicions", () => {
  it("finds nothing wrong in a faithful translation", () => {
    expect(
      codes("Don't go back to town before nightfall.", "Ne retourne pas en ville avant la tombée de la nuit."),
    ).toEqual([]);
    expect(codes("You have 3 new messages.", "Tu as 3 nouveaux messages.")).toEqual([]);
  });

  it("notices numbers that changed, but not their thousands separators, nor placeholders", () => {
    expect(codes("Wait 3 days.", "Attends 30 jours.")).toEqual(["numbers-changed"]);
    expect(codes("Costs 1,000 coins.", "Coûte 1 000 pièces.")).toEqual([]);
    expect(codes("Costs 1.5 coins.", "Coûte 1,5 pièce.")).toEqual([]);
    expect(codes("Level {level2} reached", "Niveau {level2} atteint")).toEqual([]);
    expect(codes("%1$s has 2 lives", "%1$s a deux vies")).toEqual(["numbers-changed"]);
  });

  it("notices a translation much shorter or much longer than its source", () => {
    expect(codes("Talk to the guard at the northern gate before nightfall.", "Parle.")).toEqual(["length"]);
    const long =
      "Parle au garde de la porte nord avant la tombée de la nuit, puis reviens me voir au camp, vite, très vite.";
    expect(codes("Talk to the guard before nightfall.", long)).toEqual(["length"]);
    expect(codes("Play", "Lancer la partie")).toEqual([]); // short texts vary a lot: no length check
  });

  it("notices a negation that disappeared", () => {
    expect(codes("Don't open the door.", "Ouvre la porte.")).toEqual(["negation-lost"]);
    expect(codes("You can never go back.", "Tu peux revenir.")).toEqual(["negation-lost"]);
    expect(codes("Nothing happens.", "Rien ne se passe.")).toEqual([]);
    expect(codes("No entry", "Entrée interdite")).toEqual(["negation-lost"]); // worth a look, even when right
  });

  it("says nothing about negations in languages it has no list for", () => {
    expect(codes("Don't open the door.", "Öppna dörren.", { ...enFr, targetLanguage: "sv" })).toEqual([]);
  });

  it("notices a translation that is the source again, for two words or more", () => {
    expect(codes("Game over", "Game Over!")).toEqual(["same-as-source"]);
    expect(codes("Options", "Options")).toEqual([]); // one word: often the same in both languages
  });

  it("explains each suspicion in words", () => {
    const [suspicion] = suspicions("Wait 3 days.", "Attends 30 jours.", enFr);
    expect(suspicion?.message).toMatch(/3.*30/);
  });
});
