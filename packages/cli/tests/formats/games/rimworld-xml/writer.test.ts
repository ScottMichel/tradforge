import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import type { WriterInput } from "../../../../src/core/writer.js";
import { rimworldReader } from "../../../../src/formats/games/rimworld-xml/reader.js";
import { encodeXmlText, rimworldWriter } from "../../../../src/formats/games/rimworld-xml/writer.js";

const translations = new Map([
  ["Welcome to the camp", "Bienvenue au camp"],
  ["Press {0} to rest.", "Appuyez sur {0} pour vous reposer."],
  ["wooden bucket", "seau en bois"],
  ["A bucket made of planks.", "Un seau fait de planches."],
  ["r_name->the [adjective] lantern", "r_name->la lanterne [adjective]"],
  ["Salt & pepper", "Sel & poivre <3"],
  ["One\nTwo", "Un\nDeux"],
  ["<b>Bold</b>", "<b>Gras</b> ]]> fin"],
]);

const write = (content: string, options: Partial<WriterInput["options"]> = {}) =>
  rimworldWriter.write({
    file: "Languages/English/DefInjected/ThingDef/Camp.xml",
    content,
    translate: (source) => translations.get(source),
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target: "fr" },
  });

const file = `<?xml version="1.0" encoding="utf-8"?>
<LanguageData>

  <!-- EN: wooden bucket -->
  <TF_Bucket.label>wooden bucket</TF_Bucket.label>
  <!-- EN: A bucket made of planks. -->
  <TF_Bucket.description>
    A bucket made of planks.
  </TF_Bucket.description>
  <TF_Bucket.note lang="en">Not translated yet</TF_Bucket.note>
  <TF_Lantern.rulePack.rulesStrings>
    <li>r_name->the [adjective] lantern</li>
    <li>adjective->bright</li>
  </TF_Lantern.rulePack.rulesStrings>
  <TF_Empty.label />

</LanguageData>
`;

describe("rimworldWriter", () => {
  it("replaces the translated texts in place and keeps everything else byte for byte", () => {
    const result = write(file);
    expect(result.content).toBe(`<?xml version="1.0" encoding="utf-8"?>
<LanguageData>

  <!-- EN: wooden bucket -->
  <TF_Bucket.label>seau en bois</TF_Bucket.label>
  <!-- EN: A bucket made of planks. -->
  <TF_Bucket.description>
    Un seau fait de planches.
  </TF_Bucket.description>
  <TF_Bucket.note lang="en">Not translated yet</TF_Bucket.note>
  <TF_Lantern.rulePack.rulesStrings>
    <li>r_name->la lanterne [adjective]</li>
    <li>adjective->bright</li>
  </TF_Lantern.rulePack.rulesStrings>
  <TF_Empty.label />

</LanguageData>
`);
    expect(result).toMatchObject({ translated: 3, untranslated: 2 });
  });

  it("keeps the untranslated texts even when asked to omit them: list items must keep their index", () => {
    expect(write(file, { untranslated: "omit" }).content).toBe(write(file).content);
  });

  it("escapes the XML special characters and writes line breaks as RimWorld's \\n", () => {
    const content = String.raw`<LanguageData><A>Salt &amp; pepper</A><B>One\nTwo</B></LanguageData>`;
    expect(write(content).content).toBe(
      String.raw`<LanguageData><A>Sel &amp; poivre &lt;3</A><B>Un\nDeux</B></LanguageData>`,
    );
  });

  it("keeps the CDATA form of a text, splitting a ]]> of the translation", () => {
    expect(write("<LanguageData><A><![CDATA[<b>Bold</b>]]></A></LanguageData>").content).toBe(
      "<LanguageData><A><![CDATA[<b>Gras</b> ]]]]><![CDATA[> fin]]></A></LanguageData>",
    );
  });

  it("escapes non-ASCII characters as character references when asked to, CDATA included", () => {
    const content = "<LanguageData><A>wooden bucket</A><B><![CDATA[<b>Bold</b>]]></B></LanguageData>";
    expect(write(content, { asciiOnly: true }).content).toBe(
      "<LanguageData><A>seau en bois</A><B>&lt;b>Gras&lt;/b> ]]&gt; fin</B></LanguageData>",
    );
    expect(encodeXmlText("\u{e9}t\u{e9} \u{1f600}", true)).toBe("&#233;t&#233; &#128512;");
  });

  it("keeps the byte order mark and CRLF line endings", () => {
    const content = "\u{feff}<LanguageData>\r\n  <A>wooden bucket</A>\r\n  <B>Other</B>\r\n</LanguageData>\r\n";
    expect(write(content).content).toBe(
      "\u{feff}<LanguageData>\r\n  <A>seau en bois</A>\r\n  <B>Other</B>\r\n</LanguageData>\r\n",
    );
  });

  it("leaves a file without LanguageData root as it is", () => {
    const content = "<LanguageInfo><name>wooden bucket</name></LanguageInfo>";
    expect(write(content)).toEqual({ content, translated: 0, untranslated: 0 });
  });

  it("rejects invalid XML like the reader", () => {
    expect(() => write("<LanguageData><A>x</LanguageData>")).toThrow(ReadError);
  });

  it("writes files that the reader reads back as the translations", () => {
    for (const asciiOnly of [false, true]) {
      const content = String.raw`<LanguageData>
  <A>Salt &amp; pepper</A>
  <B>One\nTwo</B>
  <C><![CDATA[<b>Bold</b>]]></C>
  <D>wooden bucket</D>
</LanguageData>`;
      const written = write(content, { asciiOnly }).content;
      const read = rimworldReader.read({ file: "Keyed/Camp.xml", content: written, priority: 0 });
      expect(read.map((o) => o.source)).toEqual(["Sel & poivre <3", "Un\nDeux", "<b>Gras</b> ]]> fin", "seau en bois"]);
    }
  });
});
