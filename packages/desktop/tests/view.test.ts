import { describe, expect, it } from "vitest";
import { CATALOGS } from "../src/renderer/i18n/catalog.js";
import {
  countByState,
  engineLabel,
  filterEntries,
  formatLabel,
  installedModel,
  outputFor,
  samePath,
} from "../src/renderer/view.js";
import type { EntryView } from "../src/shared/bridge.js";

describe("formatLabel", () => {
  it("names the formats as their users know them, in the language of the interface when it has words", () => {
    expect(formatLabel("zomboid-txt", CATALOGS.en)).toBe("Project Zomboid");
    expect(formatLabel("docx", CATALOGS.fr)).toBe("Word");
    expect(formatLabel("srt", CATALOGS.de)).toBe("SRT-Untertitel");
    expect(formatLabel("something-new", CATALOGS.en)).toBe("something-new");
  });
});

describe("engineLabel", () => {
  it("keeps the brands and translates the generic name", () => {
    expect(engineLabel("anthropic", CATALOGS.fr.openAiCompatible)).toBe("Claude");
    expect(engineLabel("openai-compatible", CATALOGS.es.openAiCompatible)).toBe("API compatible con OpenAI");
  });
});

describe("outputFor", () => {
  it("shows where the files of a language go", () => {
    expect(outputFor("locales/{lang}/{name}{ext}", "fr")).toBe("locales/fr/{name}{ext}");
    expect(outputFor("Translate/{LANG}/{stem}_{LANG}.txt", "fr")).toBe("Translate/FR/{stem}_FR.txt");
    expect(outputFor("localisation/{language}/{name}", "de")).toBe("localisation/german/{name}");
  });
});

describe("samePath", () => {
  it("sees one path whatever its slashes, and without case on Windows only", () => {
    expect(samePath("C:\\Mods\\Guide.md", "c:/mods/Guide.md")).toBe(true);
    expect(samePath("C:/Mods/", "C:\\Mods")).toBe(true);
    expect(samePath("/home/me/Mods", "/home/me/mods")).toBe(false);
    expect(samePath("C:/Mods/a.md", "C:/Mods/b.md")).toBe(false);
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
