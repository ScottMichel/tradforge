import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { CATALOGS, pickLanguage, UI_LANGUAGES } from "../src/renderer/i18n/catalog.js";
import { setLocale } from "../src/renderer/i18n/format.js";
import { ERROR_CODES } from "../src/shared/bridge.js";

afterEach(() => setLocale("en"));

describe("pickLanguage", () => {
  it("keeps the language chosen before, else takes the first one of the system the interface speaks", () => {
    expect(pickLanguage("de", ["fr-FR"])).toBe("de");
    expect(pickLanguage("xx", ["ja-JP", "pt-BR", "en"])).toBe("pt");
    expect(pickLanguage(null, ["ja"])).toBe("en");
  });
});

describe("catalogs", () => {
  it("cover every language of the menu", () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(UI_LANGUAGES.map((language) => language.code).sort());
  });

  it("follow the plural rules of each language", () => {
    setLocale("fr");
    expect(CATALOGS.fr.done(0, "")).toBe("Terminé : 0 texte traduit.");
    expect(CATALOGS.fr.done(1500, "")).toBe(`Terminé : 1${"\u{202f}"}500 textes traduits.`);
    setLocale("en");
    expect(CATALOGS.en.done(0, "")).toBe("Done: 0 texts translated.");
    expect(CATALOGS.en.done(1, "")).toBe("Done: 1 text translated.");
    setLocale("de");
    expect(CATALOGS.de.progress(1, 13)).toBe("1 von 13 Texten");
    expect(CATALOGS.de.progress(0, 1)).toBe("0 von 1 Text");
  });

  it("word every error in every language, with the language names in that language", () => {
    for (const language of UI_LANGUAGES) {
      setLocale(language.code);
      for (const code of ERROR_CODES) {
        const message = CATALOGS[language.code].errors[code]({ path: "C:/x", file: "a.png", from: "en", to: "de" });
        expect(message.length, `${language.code} ${code}`).toBeGreaterThan(10);
      }
    }
    setLocale("fr");
    expect(CATALOGS.fr.errors["languages-locked"]({ from: "en", to: "de" })).toContain("(anglais → allemand)");
  });

  it("say the time left as people say it", () => {
    expect(CATALOGS.en.duration(20_000)).toBe("less than a minute left");
    expect(CATALOGS.fr.duration(3 * 60_000 + 10_000)).toBe("environ 3 min restantes");
    expect(CATALOGS.de.duration(80 * 60_000)).toBe("noch etwa 1 Std. 20 Min.");
    expect(CATALOGS.es.duration(120 * 60_000)).toBe("quedan unas 2 h");
  });

  it("hold every text the page names with data-i18n", () => {
    const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
    const keys = [...html.matchAll(/data-i18n(?:-placeholder|-label)?="([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(keys.length).toBeGreaterThan(20);
    for (const language of UI_LANGUAGES) {
      const catalog: Record<string, unknown> = CATALOGS[language.code];
      for (const key of keys) expect(typeof catalog[key], `${language.code}: ${key}`).toBe("string");
    }
  });
});
