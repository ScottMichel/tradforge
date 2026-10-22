import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import type { WriterInput } from "../../../../src/core/writer.js";
import { resxReader } from "../../../../src/formats/apps/resx/reader.js";
import { resxWriter } from "../../../../src/formats/apps/resx/writer.js";

const file = "Forge/Properties/Strings.resx";

const resx = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <data name="AppName" xml:space="preserve">
    <value>The Cold Forge</value>
    <comment>Title of the main window</comment>
  </data>
  <data name="Welcome" xml:space="preserve">
    <value>Welcome back, {0}! Fish &amp; chips.</value>
  </data>
  <data name="Icon" type="System.Resources.ResXFileRef, System.Windows.Forms">
    <value>..\\icon.png;System.Drawing.Bitmap</value>
  </data>
  <data name="&gt;&gt;button1.Name" xml:space="preserve">
    <value>button1</value>
  </data>
  <data name="$this.Text" xml:space="preserve">
    <value>Form1</value>
  </data>
  <data name="Empty" xml:space="preserve">
    <value />
  </data>
</root>
`;

describe("resxReader", () => {
  it("reads the strings, their comment as context, and leaves out files and designer data", () => {
    const occurrences = resxReader.read({ file, content: resx, priority: 0 });
    expect(occurrences).toEqual([
      {
        source: "The Cold Forge",
        location: { file, key: "AppName", line: 7 },
        priority: 0,
        context: "Title of the main window",
      },
      { source: "Welcome back, {0}! Fish & chips.", location: { file, key: "Welcome", line: 11 }, priority: 0 },
    ]);
  });

  it("names the file of a document that is not a .resx file", () => {
    expect(() => resxReader.read({ file, content: "<resources/>", priority: 0 })).toThrow(
      new ReadError(file, "not a .resx file (its root is <resources>)"),
    );
  });
});

describe("resxWriter", () => {
  const write = (content: string, table: Record<string, string>, options: Partial<WriterInput["options"]> = {}) =>
    resxWriter.write({
      file,
      content,
      translate: (source) => table[source],
      options: { asciiOnly: false, untranslated: "keep-source", ...options },
      languages: { source: "en", target: "fr" },
    });

  it("writes each translation in its value, escaped, and leaves everything else as it is", () => {
    const result = write(resx, {
      "The Cold Forge": "La forge froide",
      "Welcome back, {0}! Fish & chips.": "Bon retour, {0} ! Poisson & frites <maison>.",
    });
    expect(result.content).toBe(
      resx
        .replace("<value>The Cold Forge</value>", "<value>La forge froide</value>")
        .replace(
          "<value>Welcome back, {0}! Fish &amp; chips.</value>",
          "<value>Bon retour, {0} ! Poisson &amp; frites &lt;maison&gt;.</value>",
        ),
    );
    expect(result).toMatchObject({ translated: 2, untranslated: 0 });
  });

  it("leaves an untranslated string out with omit, and escapes non-ASCII with asciiOnly", () => {
    const only = { "The Cold Forge": "Été" };
    const omitted = write(resx, only, { untranslated: "omit", asciiOnly: true }).content;
    expect(omitted).toContain("<value>&#201;t&#233;</value>");
    expect(omitted).not.toContain('name="Welcome"');
    expect(omitted).toContain('name="Icon"');
  });
});
