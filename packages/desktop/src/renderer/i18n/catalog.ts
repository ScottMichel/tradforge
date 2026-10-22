import { de } from "./catalogs/de.js";
import { en, type Messages } from "./catalogs/en.js";
import { es } from "./catalogs/es.js";
import { fr } from "./catalogs/fr.js";
import { it } from "./catalogs/it.js";
import { pt } from "./catalogs/pt.js";

export type { Messages };

/** The languages of the interface, each named in itself for the menu. */
export const UI_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "it", name: "Italiano" },
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number]["code"];

export const CATALOGS: Readonly<Record<UiLanguage, Messages>> = { en, fr, es, de, pt, it };

function isUiLanguage(code: string): code is UiLanguage {
  return UI_LANGUAGES.some((language) => language.code === code);
}

/** The language chosen before, else the first one of the system the interface speaks ("pt-BR" → pt), else English. */
export function pickLanguage(saved: string | null | undefined, preferred: readonly string[]): UiLanguage {
  if (saved !== null && saved !== undefined && isUiLanguage(saved)) return saved;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0] ?? "";
    if (isUiLanguage(base)) return base;
  }
  return "en";
}
