import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../../../src/core/config.js";
import { TranslationMemory } from "../../../src/core/memory.js";
import { buildProject } from "../../../src/formats/build.js";
import { extractSegments } from "../../../src/formats/extract.js";

describe("a Rails-like YAML project", () => {
  let root: string;
  const source = `en:
  forge:
    title: The Cold Forge
    bars:
      one: One bar left
      other: "%{count} bars left"
    open: true
`;
  const config = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "yaml", include: ["config/locales/en.yml"], output: { path: "config/locales/{lang}.yml" } }],
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-yaml-"));
    await mkdir(path.join(root, "config/locales"), { recursive: true });
    await writeFile(path.join(root, "config/locales/en.yml"), source);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("extracts the texts and writes the file of the target language under its own key", async () => {
    const segments = await extractSegments(root, config);
    expect(segments.map((s) => s.source)).toEqual(["The Cold Forge", "One bar left", "%{count} bars left"]);

    const memory = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
    memory.recordMachine("The Cold Forge", "La forge froide", "m");
    memory.recordMachine("One bar left", "Il reste un lingot", "m");
    memory.recordMachine("%{count} bars left", "Il reste %{count} lingots", "m");
    const report = await buildProject(root, config, memory);
    expect(report).toMatchObject([{ output: "config/locales/fr.yml", translated: 3, untranslated: 0, written: true }]);
    expect(await readFile(path.join(root, "config/locales/fr.yml"), "utf8")).toBe(`fr:
  forge:
    title: La forge froide
    bars:
      one: Il reste un lingot
      other: "Il reste %{count} lingots"
    open: true
`);
  });
});
