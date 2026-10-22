import { CATALOGS, type Messages, pickLanguage, type UiLanguage } from "./catalog.js";
import { setLocale } from "./format.js";

export type { Messages };

/**
 * The language of the interface: chosen in the menu, remembered on this computer, applied to the static texts of the
 * page (data-i18n attributes); the screens draw their own texts with t() and draw again when it changes.
 */

const STORAGE_KEY = "tradforge.language";

let current: UiLanguage = "en";
const listeners = new Set<() => void>();

/** The texts in the current language. */
export function t(): Messages {
  return CATALOGS[current];
}

export function currentLanguage(): UiLanguage {
  return current;
}

export function startLanguage(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage refused: the language of the system is used.
  }
  apply(pickLanguage(saved, navigator.languages));
}

export function setLanguage(language: UiLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not remembered: the choice still applies until the application closes.
  }
  apply(language);
  for (const listener of listeners) listener();
}

export function onLanguageChange(listener: () => void): void {
  listeners.add(listener);
}

function apply(language: UiLanguage): void {
  current = language;
  setLocale(language);
  document.documentElement.lang = language;
  translateStatic(document);
}

type TextKey = { [K in keyof Messages]: Messages[K] extends string ? K : never }[keyof Messages];

function text(key: string | undefined): string | undefined {
  const value = key === undefined ? undefined : t()[key as TextKey];
  return typeof value === "string" ? value : undefined;
}

/** data-i18n: the text of the element; data-i18n-placeholder, data-i18n-label: those attributes; data-i18n-step. */
export function translateStatic(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const value = text(element.dataset.i18n);
    if (value !== undefined) element.textContent = value;
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const value = text(element.dataset.i18nPlaceholder);
    if (value !== undefined) element.setAttribute("placeholder", value);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-label]")) {
    const value = text(element.dataset.i18nLabel);
    if (value !== undefined) element.setAttribute("aria-label", value);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-step]")) {
    element.textContent = t().stepOf(Number(element.dataset.i18nStep));
  }
}
