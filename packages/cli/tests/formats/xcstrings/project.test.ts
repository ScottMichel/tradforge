import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../../../src/core/config.js";
import { TranslationMemory } from "../../../src/core/memory.js";
import { buildProject } from "../../../src/formats/build.js";
import { extractSegments } from "../../../src/formats/extract.js";

describe("an Xcode string catalog", () => {
  let root: string;
  const catalog = `{
  "sourceLanguage" : "en",
  "strings" : {
    "The Cold Forge" : {

    }
  },
  "version" : "1.0"
}
`;
  const config = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "xcstrings", include: ["Forge/*.xcstrings"], output: { path: "{dir}/{name}{ext}" } }],
  });
  const file = () => path.join(root, "Forge/Localizable.xcstrings");

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-xcstrings-"));
    await mkdir(path.join(root, "Forge"));
    await writeFile(file(), catalog);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes the translation into the catalog itself, and reads the same texts afterwards", async () => {
    const memory = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
    memory.recordMachine("The Cold Forge", "La forge froide", "m");
    const report = await buildProject(root, config, memory);
    expect(report).toMatchObject([{ output: "Forge/Localizable.xcstrings", translated: 1, written: true }]);
    const written = await readFile(file(), "utf8");
    expect(JSON.parse(written).strings["The Cold Forge"].localizations.fr.stringUnit.value).toBe("La forge froide");

    expect((await extractSegments(root, config)).map((segment) => segment.source)).toEqual(["The Cold Forge"]);
    expect(await buildProject(root, config, memory)).toMatchObject([{ written: false }]);
  });

  it("still refuses to write over the source file of another format", async () => {
    const json = parseConfig({
      sourceLanguage: "en",
      targetLanguage: "fr",
      sources: [{ format: "json", include: ["Forge/*.xcstrings"], output: { path: "{dir}/{name}{ext}" } }],
    });
    await expect(
      buildProject(root, json, new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } })),
    ).rejects.toThrow(/would overwrite its source/);
  });
});
