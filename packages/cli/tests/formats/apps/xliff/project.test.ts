import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { effectivePlaceholders, parseConfig } from "../../../../src/core/config.js";
import { TranslationMemory } from "../../../../src/core/memory.js";
import { validateTranslation } from "../../../../src/core/validation/validate.js";
import { buildProject } from "../../../../src/formats/project/build.js";
import { extractSegments } from "../../../../src/formats/project/extract.js";

describe("an XLIFF project", () => {
  let root: string;
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" datatype="plaintext" original="ng2.template">
    <body>
      <trans-unit id="welcome" datatype="html">
        <source>Welcome, <x id="INTERPOLATION" equiv-text="{{ name }}"/>!</source>
      </trans-unit>
    </body>
  </file>
</xliff>
`;
  const config = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "xliff", include: ["src/locale/messages.xlf"], output: { path: "{dir}/{name}.{lang}{ext}" } }],
    validation: { placeholders: ["braces"] },
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-xliff-"));
    await mkdir(path.join(root, "src/locale"), { recursive: true });
    await writeFile(path.join(root, "src/locale/messages.xlf"), source);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("checks the inline tags even when the configuration does not ask for markup", () => {
    expect(effectivePlaceholders(config)).toContain("markup");
    const issues = validateTranslation(
      { source: 'Welcome, <x id="INTERPOLATION" equiv-text="{{ name }}"/>!', target: "Bienvenue, {{ name }} !" },
      { placeholders: effectivePlaceholders(config) },
    );
    expect(issues.map((issue) => issue.code)).toContain("markup-changed");
  });

  it("extracts the units and writes the translation next to the source, as Angular names it", async () => {
    const segments = await extractSegments(root, config);
    expect(segments.map((s) => s.source)).toEqual(['Welcome, <x id="INTERPOLATION" equiv-text="{{ name }}"/>!']);

    const memory = new TranslationMemory({ languages: { sourceLanguage: "en", targetLanguage: "fr" } });
    memory.recordMachine(
      segments[0]?.source ?? "",
      'Bienvenue, <x id="INTERPOLATION" equiv-text="{{ name }}"/> !',
      "m",
    );
    const report = await buildProject(root, config, memory);
    expect(report).toMatchObject([{ output: "src/locale/messages.fr.xlf", translated: 1, written: true }]);
    const written = await readFile(path.join(root, "src/locale/messages.fr.xlf"), "utf8");
    expect(written).toContain('original="ng2.template" target-language="fr">');
    expect(written).toContain(
      '        <target state="translated">Bienvenue, <x id="INTERPOLATION" equiv-text="{{ name }}"/> !</target>\n',
    );
  });
});
