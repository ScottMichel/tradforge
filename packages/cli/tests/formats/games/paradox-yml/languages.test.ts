import { describe, expect, it } from "vitest";
import { paradoxLanguage } from "../../../../src/formats/games/paradox-yml/languages.js";

describe("paradoxLanguage", () => {
  it("names the languages of Paradox games", () => {
    expect(
      ["en", "fr", "de", "es", "ru", "pl", "pt-BR", "zh-CN", "ja", "ko", "tr"].map((code) => paradoxLanguage(code)),
    ).toEqual([
      "english",
      "french",
      "german",
      "spanish",
      "russian",
      "polish",
      "braz_por",
      "simp_chinese",
      "japanese",
      "korean",
      "turkish",
    ]);
  });

  it("ignores the case and the separator of the code", () => {
    expect(paradoxLanguage("PT_br")).toBe("braz_por");
    expect(paradoxLanguage("zh-hans")).toBe("simp_chinese");
    expect(paradoxLanguage("FR")).toBe("french");
  });

  it("uses the base language of a regional code", () => {
    expect(paradoxLanguage("fr-CA")).toBe("french");
    expect(paradoxLanguage("es-MX")).toBe("spanish");
    expect(paradoxLanguage("pt")).toBe("braz_por");
    expect(paradoxLanguage("zh")).toBe("simp_chinese");
  });

  it("does not turn traditional Chinese into simplified Chinese", () => {
    expect(paradoxLanguage("zh-TW")).not.toBe("simp_chinese");
    expect(paradoxLanguage("zh-Hant")).not.toBe("simp_chinese");
    expect(paradoxLanguage("zh-TW")).toBe("chinese_taiwan");
  });

  it("falls back to the English name in lower case, with underscores, for other languages", () => {
    expect(paradoxLanguage("it")).toBe("italian");
    expect(paradoxLanguage("nl")).toBe("dutch");
    expect(paradoxLanguage("uk")).toBe("ukrainian");
    expect(paradoxLanguage("it_IT")).toBe("italian");
  });

  it("keeps a code that is not a language tag, made safe for a header", () => {
    expect(paradoxLanguage("klingon!")).toBe("klingon");
  });
});
