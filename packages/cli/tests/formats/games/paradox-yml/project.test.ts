import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../../../../src/core/config.js";
import { TranslationMemory } from "../../../../src/core/memory.js";
import { buildProject } from "../../../../src/formats/project/build.js";
import { extractSegments } from "../../../../src/formats/project/extract.js";

const BOM = Uint8Array.of(0xef, 0xbb, 0xbf);

describe("a Paradox project", () => {
  let root: string;
  const source =
    'l_english:\n forge_event.1.t:0 "The Cold Forge"\n forge_event.1.d:0 "Bring §Ycoal§!, [Root.GetName]."\n';
  const config = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [
      {
        format: "paradox-yml",
        include: ["localisation/english/*_l_english.yml"],
        output: { path: "{dir}/../{language}/{stem}_l_{language}{ext}", encoding: "utf-8-bom" },
      },
    ],
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-paradox-"));
    const file = path.join(root, "localisation/english/forge_l_english.yml");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.concat([BOM, Buffer.from(source)]));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("extracts the entries and writes the translated file next to the other languages, with a BOM", async () => {
    const segments = await extractSegments(root, config);
    expect(segments.map((s) => s.source)).toEqual(["The Cold Forge", "Bring §Ycoal§!, [Root.GetName]."]);

    const memory = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
    memory.recordMachine("The Cold Forge", "La forge froide", "m");
    const report = await buildProject(root, config, memory);
    expect(report).toMatchObject([
      { output: "localisation/french/forge_l_french.yml", translated: 1, untranslated: 1, written: true },
    ]);

    const bytes = await readFile(path.join(root, "localisation/french/forge_l_french.yml"));
    expect([...bytes.subarray(0, 3)]).toEqual([...BOM]);
    expect(bytes.subarray(3).toString("utf8")).toBe(
      'l_french:\n forge_event.1.t:0 "La forge froide"\n forge_event.1.d:0 "Bring §Ycoal§!, [Root.GetName]."\n',
    );
  });
});
