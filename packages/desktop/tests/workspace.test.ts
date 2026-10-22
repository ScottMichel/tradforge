import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockProvider, stripJsonComments } from "tradforge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspace } from "../src/main/workspace.js";
import type { ProgressView, SettingsView } from "../src/shared/bridge.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tradforge-desktop-"));
  await mkdir(join(root, "locales", "en"), { recursive: true });
  await writeFile(
    join(root, "locales", "en", "app.json"),
    `${JSON.stringify({ menu: { play: "Play the game", quit: "Quit the game" }, broken: "Say {name}" }, null, 2)}\n`,
  );
  await writeFile(join(root, "package.json"), "{}\n");
});

afterEach(() => rm(root, { recursive: true, force: true }));

/** Translates "Say {name}" without its placeholder: refused by validation. */
const mock = () =>
  createMockProvider({ translate: (source) => (source === "Say {name}" ? "Dis bonjour" : `FR ${source}`) });

/** Replaces the engine in the configuration file, as a user editing it by hand would. */
async function withProvider(file: string, provider: Record<string, unknown>): Promise<void> {
  const raw = JSON.parse(stripJsonComments(await readFile(file, "utf8")));
  await writeFile(file, JSON.stringify({ ...raw, provider }));
}

async function created() {
  const workspace = createWorkspace({ createProvider: mock });
  await workspace.createProject(root, "en", "fr", [0]);
  return workspace;
}

describe("openFolder", () => {
  it("shows what detection finds in a folder that is not a project yet", async () => {
    const project = await createWorkspace().open(root, "en", "fr");
    expect(project).toMatchObject({ root, configured: false, sourceLanguage: "en", targetLanguage: "fr" });
    expect(project.sources).toEqual([
      { format: "json", include: ["locales/en/*.json"], files: 1, output: "locales/{lang}/{name}{ext}" },
    ]);
    expect(project.skipped.map((skipped) => skipped.file)).toContain("package.json");
    expect(project.stats).toBeUndefined();
  });

  it("opens an existing project with its configuration and its progress", async () => {
    const workspace = await created();
    const project = await workspace.open(root, "de", "it");
    expect(project).toMatchObject({ configured: true, sourceLanguage: "en", targetLanguage: "fr", skipped: [] });
    expect(project.sources).toEqual([
      { format: "json", include: ["locales/en/*.json"], output: "locales/{lang}/{name}{ext}" },
    ]);
    expect(project.stats).toEqual({ total: 3, translated: 0, reviewed: 0, failed: 0, pending: 3 });
  });

  it("refuses a path where there is nothing, with a code the page words", async () => {
    const missing = join(root, "missing");
    await expect(createWorkspace().open(missing, "en", "fr")).rejects.toMatchObject({
      code: "not-found",
      params: { path: missing },
    });
  });
});

describe("open one file", () => {
  it("makes its folder the project and the file its only source", async () => {
    await writeFile(join(root, "intro.en.srt"), "1\n00:00:01,000 --> 00:00:02,000\nHello there.\n");
    const project = await createWorkspace().open(join(root, "intro.en.srt"), "en", "fr");
    expect(project).toMatchObject({ root, file: "intro.en.srt", configured: false });
    expect(project.sources).toHaveLength(1);
    expect(project.sources[0]).toMatchObject({ format: "srt", include: ["intro.en.srt"], files: 1 });
  });

  it("takes the format of the extension when detection leaves the file out, and writes it next to it", async () => {
    await writeFile(join(root, "Notes [draft].md"), "# Notes\n\nSome notes for the team.\n");
    const workspace = createWorkspace();
    const opened = await workspace.open(join(root, "Notes [draft].md"), "en", "fr");
    expect(opened.sources).toEqual([
      { format: "markdown", include: ["Notes [[]draft[]].md"], files: 1, output: "{dir}/{name}.{lang}{ext}" },
    ]);
    const project = await workspace.createProject(join(root, "Notes [draft].md"), "en", "fr", [0]);
    expect(project).toMatchObject({ configured: true, file: "Notes [draft].md" });
    expect(project.stats?.total).toBe(2);
  });

  it("refuses a file that no format reads", async () => {
    await writeFile(join(root, "photo.png"), "not really a picture");
    await expect(createWorkspace().open(join(root, "photo.png"), "en", "fr")).rejects.toMatchObject({
      code: "file-not-supported",
      params: { file: "photo.png" },
    });
  });

  it("opens the project of its folder when there is one", async () => {
    const workspace = await created();
    const project = await workspace.open(join(root, "package.json"), "en", "fr");
    expect(project).toMatchObject({ configured: true, file: "package.json" });
  });
});

describe("createProject", () => {
  it("writes a configuration with the chosen formats only", async () => {
    await writeFile(join(root, "notes.en.md"), "# Notes\n\nSome notes for the team.\n");
    const workspace = createWorkspace();
    const found = await workspace.open(root, "en", "fr");
    expect(found.sources.map((source) => source.format)).toEqual(["json", "markdown"]);

    const project = await workspace.createProject(root, "en", "fr", [1]);
    expect(project.configured).toBe(true);
    expect(project.sources.map((source) => source.format)).toEqual(["markdown"]);
    expect(await readFile(join(root, "tradforge.config.json"), "utf8")).toContain('"targetLanguage": "fr"');
  });

  it("needs at least one format, and never replaces an existing configuration", async () => {
    await expect(createWorkspace().createProject(root, "en", "fr", [])).rejects.toThrow(/at least one/);
    const workspace = await created();
    await expect(workspace.createProject(root, "en", "fr", [0])).rejects.toThrow(/already/);
  });
});

describe("settings", () => {
  it("reads the languages, the engine and the instructions", async () => {
    const workspace = await created();
    expect(await workspace.settings(root)).toEqual({
      sourceLanguage: "en",
      targetLanguage: "fr",
      engine: "ollama",
      model: "mistral-small",
      address: "http://localhost:11434",
      instructions: "Video game texts. Keep a natural, casual tone.",
    });
  });

  it("saves them, keeps the rest of the configuration, and takes the defaults of a new engine", async () => {
    const workspace = await created();
    const before = await workspace.settings(root);
    const saved = await workspace.saveSettings(root, {
      ...before,
      targetLanguage: "de",
      engine: "deepl",
      model: "",
      address: "",
      instructions: "A tabletop game.",
    });
    expect(saved).toEqual({
      sourceLanguage: "en",
      targetLanguage: "de",
      engine: "deepl",
      model: "deepl",
      address: "",
      instructions: "A tabletop game.",
    });
    const raw = JSON.parse(stripJsonComments(await readFile(join(root, "tradforge.config.json"), "utf8")));
    expect(raw.provider).toEqual({ type: "deepl" });
    expect(raw.translation.glossary).toEqual({ NPC: "PNJ" });
    expect(raw.sources[0].format).toBe("json");
  });

  it("keeps the comments of the configuration, which explain every setting", async () => {
    const workspace = await created();
    const file = join(root, "tradforge.config.json");
    const before = await readFile(file, "utf8");
    const settings = await workspace.settings(root);
    await workspace.saveSettings(root, { ...settings, model: "qwen3:14b", instructions: "" });
    const after = await readFile(file, "utf8");
    const comments = (text: string) => text.split("\n").filter((line) => line.trim().startsWith("//"));
    expect(comments(after)).toEqual(comments(before));
    expect(after).toContain('"provider": {\n    "type": "ollama",\n    "model": "qwen3:14b",');
    expect(after).not.toContain('"instructions"');
  });

  it("keeps the settings of the same engine that the application does not edit", async () => {
    const workspace = await created();
    const file = join(root, "tradforge.config.json");
    await withProvider(file, {
      type: "gemini",
      model: "gemini-flash-latest",
      apiKeyEnv: "MY_GEMINI",
      pricing: { inputPerMillion: 1, outputPerMillion: 2 },
    });
    const settings = await workspace.settings(root);
    await workspace.saveSettings(root, { ...settings, model: "gemini-pro-latest" });
    expect(JSON.parse(stripJsonComments(await readFile(file, "utf8"))).provider).toEqual({
      type: "gemini",
      model: "gemini-pro-latest",
      apiKeyEnv: "MY_GEMINI",
      pricing: { inputPerMillion: 1, outputPerMillion: 2 },
    });
  });

  it("refuses to change the languages once the memory holds translations of the project", async () => {
    const workspace = await created();
    const settings = await workspace.settings(root);
    await workspace.saveSettings(root, { ...settings, targetLanguage: "de" });
    await workspace.translate(root, { retryFailed: false });
    await expect(workspace.saveSettings(root, { ...settings, targetLanguage: "fr" })).rejects.toThrow(/en → de/);
    await workspace.saveSettings(root, { ...settings, targetLanguage: "de", model: "qwen3:14b" });
  });

  it("refuses invalid settings and leaves the file as it was", async () => {
    const workspace = await created();
    const file = join(root, "tradforge.config.json");
    const before = await readFile(file, "utf8");
    const settings = await workspace.settings(root);
    await expect(workspace.saveSettings(root, { ...settings, engine: "gemini", model: "" })).rejects.toThrow(
      /provider\.model/,
    );
    expect(await readFile(file, "utf8")).toBe(before);
  });
});

describe("engineStatus", () => {
  const ollama: SettingsView = {
    sourceLanguage: "en",
    targetLanguage: "fr",
    engine: "ollama",
    model: "mistral-small",
    address: "http://localhost:11434/",
    instructions: "",
  };

  it("lists the models Ollama has installed", async () => {
    const asked: string[] = [];
    const fetch = async (url: string | URL | Request) => {
      asked.push(String(url));
      return Response.json({ models: [{ name: "qwen3:14b" }, { name: "mistral-small:latest" }] });
    };
    const status = await createWorkspace({ fetch: fetch as typeof globalThis.fetch }).engineStatus(root, ollama);
    expect(status).toEqual({
      kind: "ollama",
      ready: true,
      host: "http://localhost:11434",
      models: ["mistral-small:latest", "qwen3:14b"],
    });
    expect(asked).toEqual(["http://localhost:11434/api/tags"]);
  });

  it("explains when Ollama does not answer", async () => {
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const status = await createWorkspace({ fetch: fetch as typeof globalThis.fetch }).engineStatus(root, ollama);
    expect(status).toEqual({ kind: "ollama", ready: false, host: "http://localhost:11434" });
  });

  it("reads the name of the key variable from the configuration of the same engine", async () => {
    await created();
    const file = join(root, "tradforge.config.json");
    await withProvider(file, { type: "gemini", model: "gemini-flash-latest", apiKeyEnv: "MY_GEMINI" });
    const gemini = { ...ollama, engine: "gemini" as const, model: "gemini-flash-latest", address: "" };
    const status = await createWorkspace({ env: { MY_GEMINI: "k" } }).engineStatus(root, gemini);
    expect(status).toEqual({ kind: "api", ready: true, keyVariable: "MY_GEMINI" });
    const claude = { ...gemini, engine: "anthropic" as const, model: "claude-haiku-5-5" };
    expect(await createWorkspace({ env: {} }).engineStatus(root, claude)).toMatchObject({
      keyVariable: "ANTHROPIC_API_KEY",
    });
  });

  it("tells whether the API key is set, without ever giving it", async () => {
    const deepl = { ...ollama, engine: "deepl" as const, model: "deepl", address: "" };
    const withKey = createWorkspace({ env: { DEEPL_API_KEY: "secret-key:fx" } });
    const status = await withKey.engineStatus(root, deepl);
    expect(status).toEqual({ kind: "api", ready: true, keyVariable: "DEEPL_API_KEY" });
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(await createWorkspace({ env: {} }).engineStatus(root, deepl)).toEqual({
      kind: "api",
      ready: false,
      keyVariable: "DEEPL_API_KEY",
    });
  });
});

describe("translate, review and build", () => {
  it("translates, reports the progress, and keeps the failures for the review", async () => {
    const workspace = await created();
    const progress: ProgressView[] = [];
    const result = await workspace.translate(root, { retryFailed: false, onProgress: (event) => progress.push(event) });
    expect(result).toEqual({ total: 3, translated: 2, reused: 0, failed: 1, interrupted: false });
    expect(progress.at(-1)).toMatchObject({ done: 3, total: 3, translated: 2, failed: 1 });

    const entries = await workspace.entries(root);
    expect(entries).toEqual([
      { source: "Play the game", target: "FR Play the game", state: "machine", file: "locales/en/app.json" },
      { source: "Quit the game", target: "FR Quit the game", state: "machine", file: "locales/en/app.json" },
      { source: "Say {name}", state: "failed", reason: expect.stringContaining("{name}"), file: "locales/en/app.json" },
    ]);
    expect((await workspace.open(root, "en", "fr")).stats).toMatchObject({ translated: 2, failed: 1 });
  });

  it("stops between batches when asked, and keeps what is done", async () => {
    const workspace = await created();
    const controller = new AbortController();
    controller.abort();
    const result = await workspace.translate(root, { retryFailed: false, signal: controller.signal });
    expect(result.interrupted).toBe(true);
  });

  it("saves a human translation that the engine never replaces, then writes the files", async () => {
    const workspace = await created();
    await workspace.translate(root, { retryFailed: false });
    const reviewed = await workspace.review(root, "Say {name}", "Dis {name}");
    expect(reviewed).toEqual({
      source: "Say {name}",
      target: "Dis {name}",
      state: "reviewed",
      file: "locales/en/app.json",
    });

    const again = await workspace.translate(root, { retryFailed: true });
    expect(again.total).toBe(0);

    const built = await workspace.build(root, false);
    expect(built).toEqual([{ output: "locales/fr/app.json", translated: 3, untranslated: 0, written: true }]);
    const written = JSON.parse(await readFile(join(root, "locales", "fr", "app.json"), "utf8"));
    expect(written).toEqual({ menu: { play: "FR Play the game", quit: "FR Quit the game" }, broken: "Dis {name}" });
  });

  it("refuses to review a text that is not in the project, or an empty translation", async () => {
    const workspace = await created();
    await expect(workspace.review(root, "Not here", "Pas ici")).rejects.toThrow(/not in the project/);
    await expect(workspace.review(root, "Play the game", "  ")).rejects.toThrow(/empty/);
  });
});
