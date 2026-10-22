import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../../../src/core/config.js";
import { TranslationMemory } from "../../../src/core/memory.js";
import { buildProject } from "../../../src/formats/build.js";
import { detectSources } from "../../../src/formats/detect.js";
import { extractSegments } from "../../../src/formats/extract.js";
import { readZip, writeZip } from "../../../src/formats/zip/zip.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const xml = `<w:document ${W}><w:body><w:p><w:r><w:t>The Cold Forge</w:t></w:r></w:p></w:body></w:document>`;

describe("a Word document in a project", () => {
  let root: string;
  const config = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    // a text encoding that would ruin a ZIP archive: binary formats must ignore it
    sources: [
      {
        format: "docx",
        include: ["docs/*.docx"],
        encoding: "windows-1252",
        output: { path: "{dir}/{name}.{lang}{ext}" },
      },
    ],
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-docx-"));
    await mkdir(path.join(root, "docs"));
    const bytes = writeZip([{ name: "word/document.xml", data: new TextEncoder().encode(xml), compress: true }]);
    await writeFile(path.join(root, "docs/manual.docx"), bytes);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads the bytes of the document, and writes the translated archive next to it", async () => {
    expect((await extractSegments(root, config)).map((segment) => segment.source)).toEqual(["The Cold Forge"]);

    const memory = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
    memory.recordMachine("The Cold Forge", "La forge froide", "m");
    const report = await buildProject(root, config, memory);
    expect(report).toMatchObject([{ output: "docs/manual.fr.docx", translated: 1, written: true }]);

    const [part] = readZip(await readFile(path.join(root, "docs/manual.fr.docx")));
    expect(new TextDecoder().decode(part?.data())).toContain('<w:t xml:space="preserve">La forge froide</w:t>');
  });

  it("is proposed by init, but not the lock files of Word nor documents of another language", async () => {
    await writeFile(path.join(root, "docs/~$manual.docx"), "lock");
    await writeFile(path.join(root, "docs/manual.de.docx"), "x");
    const { sources, skipped } = await detectSources(root, "en");
    expect(sources).toEqual([
      { format: "docx", include: ["docs/manual.docx"], output: "docs/manual.{lang}.docx", files: 1 },
    ]);
    expect(skipped).toEqual([
      { file: "docs/manual.de.docx", reason: "a document in another language" },
      { file: "docs/~$manual.docx", reason: "a lock file of an open document" },
    ]);
  });
});
