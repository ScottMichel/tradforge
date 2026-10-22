import { describe, expect, it } from "vitest";
import {
  countByState,
  duration,
  filterEntries,
  formatLabel,
  installedModel,
  languageLabel,
  outputFor,
  plural,
} from "../src/renderer/view.js";
import type { EntryView } from "../src/shared/bridge.js";

describe("formatLabel", () => {
  it("names the formats as their users know them", () => {
    expect(formatLabel("zomboid-txt")).toBe("Project Zomboid");
    expect(formatLabel("docx")).toBe("Word");
    expect(formatLabel("something-new")).toBe("something-new");
  });
});

describe("languageLabel", () => {
  it("names a language in French, and keeps a code it does not know", () => {
    expect(languageLabel("de")).toBe("allemand");
    expect(languageLabel("pt-BR")).toBe("portugais brésilien");
    expect(languageLabel("not a code")).toBe("not a code");
  });
});

describe("outputFor", () => {
  it("shows where the files of a language go", () => {
    expect(outputFor("locales/{lang}/{name}{ext}", "fr")).toBe("locales/fr/{name}{ext}");
    expect(outputFor("Translate/{LANG}/{stem}_{LANG}.txt", "fr")).toBe("Translate/FR/{stem}_FR.txt");
    expect(outputFor("localisation/{language}/{name}", "de")).toBe("localisation/german/{name}");
  });
});

describe("plural", () => {
  it("follows French: 0 and 1 take the singular", () => {
    expect(plural(0, "texte traduit", "textes traduits")).toBe("0 texte traduit");
    expect(plural(1, "fichier")).toBe("1 fichier");
    expect(plural(1500, "fichier")).toBe(`1${"\u{202f}"}500 fichiers`);
  });
});

describe("duration", () => {
  it("rounds the time left as a person would say it", () => {
    expect(duration(20_000)).toBe("moins d'une minute");
    expect(duration(3 * 60_000 + 10_000)).toBe("environ 3 min");
    expect(duration(80 * 60_000)).toBe("environ 1 h 20");
    expect(duration(120 * 60_000)).toBe("environ 2 h");
  });
});

describe("installedModel", () => {
  it("finds a configured model among those Ollama lists, with or without its tag", () => {
    expect(installedModel("mistral-small", ["mistral-small:latest", "qwen3:14b"])).toBe(true);
    expect(installedModel("qwen3:14b", ["mistral-small:latest", "qwen3:14b"])).toBe(true);
    expect(installedModel("qwen3", ["qwen3:14b"])).toBe(false);
  });
});

describe("filterEntries", () => {
  const entries: EntryView[] = [
    { source: "Open the door", target: "Ouvre la porte", state: "machine", file: "a.json" },
    { source: "Close the door", target: "Ferme la porte", state: "reviewed", file: "a.json" },
    { source: "Say {name}", state: "failed", reason: "placeholder {name} missing", file: "a.json" },
    { source: "Quit", state: "pending", file: "b.json" },
  ];

  it("keeps the texts of a state", () => {
    expect(filterEntries(entries, "all", "").length).toBe(4);
    expect(filterEntries(entries, "failed", "").map((entry) => entry.source)).toEqual(["Say {name}"]);
    expect(countByState(entries)).toEqual({ all: 4, failed: 1, machine: 1, reviewed: 1, pending: 1 });
  });

  it("searches the texts and their translations, without case", () => {
    expect(filterEntries(entries, "all", "DOOR").length).toBe(2);
    expect(filterEntries(entries, "all", "ferme").map((entry) => entry.source)).toEqual(["Close the door"]);
    expect(filterEntries(entries, "machine", "ferme")).toEqual([]);
  });
});
