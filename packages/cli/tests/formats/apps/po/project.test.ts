import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../../../../src/core/config.js";
import { TranslationMemory } from "../../../../src/core/memory.js";
import { buildProject } from "../../../../src/formats/project/build.js";
import { extractSegments } from "../../../../src/formats/project/extract.js";

describe("a gettext project", () => {
  let root: string;
  const template = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=CHARSET\\n"

#: forge.py:3
msgid "The Cold Forge"
msgstr ""

#: forge.py:8
msgid "One bar left"
msgid_plural "%(count)d bars left"
msgstr[0] ""
msgstr[1] ""
`;
  const config = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "po", include: ["po/*.pot"], output: { path: "po/{lang}.po" } }],
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-po-"));
    await mkdir(path.join(root, "po"));
    await writeFile(path.join(root, "po/forge.pot"), template);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("extracts the texts of the template and writes the catalog of the target language", async () => {
    const segments = await extractSegments(root, config);
    expect(segments.map((s) => s.source)).toEqual(["The Cold Forge", "One bar left", "%(count)d bars left"]);

    const memory = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
    memory.recordMachine("The Cold Forge", "La forge froide", "m");
    memory.recordMachine("One bar left", "Il reste un lingot", "m");
    memory.recordMachine("%(count)d bars left", "Il reste %(count)d lingots", "m");
    const report = await buildProject(root, config, memory);
    expect(report).toMatchObject([{ output: "po/fr.po", translated: 3, untranslated: 0, written: true }]);

    expect(await readFile(path.join(root, "po/fr.po"), "utf8")).toBe(`msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: fr\\n"
"Plural-Forms: nplurals=2; plural=(n > 1);\\n"

#: forge.py:3
msgid "The Cold Forge"
msgstr "La forge froide"

#: forge.py:8
msgid "One bar left"
msgid_plural "%(count)d bars left"
msgstr[0] "Il reste un lingot"
msgstr[1] "Il reste %(count)d lingots"
`);
  });
});
