import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import { rimworldReader } from "../../../src/formats/rimworld/reader.js";

const keyedFile = "Languages/English/Keyed/Camp.xml";
const defFile = "Languages/English/DefInjected/ThingDef/Camp.xml";

const read = (content: string, file = keyedFile) => rimworldReader.read({ file, content, priority: 1 });
const keys = (content: string, file = keyedFile) =>
  read(content, file).map((occurrence) => [occurrence.location.key, occurrence.source]);

const keyed = `<?xml version="1.0" encoding="utf-8"?>
<LanguageData>

  <!-- Camp window -->
  <TF_CampTitle>Welcome to the camp</TF_CampTitle>
  <TF_CampHint>Press {0} to rest.</TF_CampHint>

  <TF_NightFalls>Night falls on {PAWN_nameDef}.</TF_NightFalls>

</LanguageData>
`;

const defInjected = `<?xml version="1.0" encoding="utf-8"?>
<LanguageData>

  <!-- EN: wooden bucket -->
  <TF_Bucket.label>wooden bucket</TF_Bucket.label>
  <!-- EN: A bucket made of planks. -->
  <TF_Bucket.description>A bucket made of planks.</TF_Bucket.description>

  <TF_Lantern.label>lantern</TF_Lantern.label>
  <TF_Lantern.rulePack.rulesStrings>
    <li>r_name->the [adjective] lantern</li>
    <li>adjective->bright</li>
  </TF_Lantern.rulePack.rulesStrings>

</LanguageData>
`;

describe("rimworldReader", () => {
  it("reads every text element of a Keyed file, with its key and line", () => {
    expect(read(keyed).map((o) => [o.location.key, o.location.line, o.source])).toEqual([
      ["TF_CampTitle", 5, "Welcome to the camp"],
      ["TF_CampHint", 6, "Press {0} to rest."],
      ["TF_NightFalls", 8, "Night falls on {PAWN_nameDef}."],
    ]);
  });

  it("records the file, key, line, priority and context of every occurrence", () => {
    const [occurrence] = rimworldReader.read({
      file: keyedFile,
      content: "<LanguageData><TF_Hello>Hello</TF_Hello></LanguageData>",
      priority: 3,
      context: "user interface",
    });
    expect(occurrence).toStrictEqual({
      source: "Hello",
      location: { file: keyedFile, key: "TF_Hello", line: 1 },
      priority: 3,
      context: "user interface",
      group: `${keyedFile}#1`,
    });
  });

  it("groups the texts of a Keyed file by blocks that no blank line separates", () => {
    expect(read(keyed).map((o) => o.group)).toEqual([`${keyedFile}#5`, `${keyedFile}#5`, `${keyedFile}#8`]);
  });

  it("keeps a block together across comments and multi-line texts", () => {
    const content = "<LanguageData>\n<A>one\ntwo</A>\n<!-- note -->\n<B>three</B>\n</LanguageData>";
    expect(read(content).map((o) => o.group)).toEqual([`${keyedFile}#2`, `${keyedFile}#2`]);
  });

  it("reads DefInjected fields and indexes list items", () => {
    expect(keys(defInjected, defFile)).toEqual([
      ["TF_Bucket.label", "wooden bucket"],
      ["TF_Bucket.description", "A bucket made of planks."],
      ["TF_Lantern.label", "lantern"],
      ["TF_Lantern.rulePack.rulesStrings.0", "r_name->the [adjective] lantern"],
      ["TF_Lantern.rulePack.rulesStrings.1", "adjective->bright"],
    ]);
  });

  it("groups the fields of a DefInjected file by def", () => {
    expect(read(defInjected, defFile).map((o) => o.group)).toEqual([
      `${defFile}#TF_Bucket`,
      `${defFile}#TF_Bucket`,
      `${defFile}#TF_Lantern`,
      `${defFile}#TF_Lantern`,
      `${defFile}#TF_Lantern`,
    ]);
  });

  it("recognises DefInjected files whatever the case of the folder", () => {
    const content = "<LanguageData><TF_A.label>a</TF_A.label></LanguageData>";
    expect(read(content, "Mod/languages/French/definjected/ThingDef/A.xml")[0]?.group).toBe(
      "Mod/languages/French/definjected/ThingDef/A.xml#TF_A",
    );
  });

  it("indexes nested list items and names the fields of list items", () => {
    const content = `<LanguageData>
  <TF_Song.verses>
    <li>first</li>
    <li>
      <li>second, inner</li>
      <li>third, inner</li>
    </li>
  </TF_Song.verses>
  <TF_Song.parts>
    <li><label>chorus</label><note/></li>
    <li><label>bridge</label></li>
  </TF_Song.parts>
</LanguageData>`;
    expect(keys(content, defFile)).toEqual([
      ["TF_Song.verses.0", "first"],
      ["TF_Song.verses.1.0", "second, inner"],
      ["TF_Song.verses.1.1", "third, inner"],
      ["TF_Song.parts.0.label", "chorus"],
      ["TF_Song.parts.1.label", "bridge"],
    ]);
  });

  it("decodes entities, character references and CDATA sections", () => {
    const content =
      "<LanguageData><A>Salt &amp; pepper &lt;3 &#233;</A><B><![CDATA[<b>Bold</b> & co]]></B></LanguageData>";
    expect(keys(content)).toEqual([
      ["A", "Salt & pepper <3 \u{e9}"],
      ["B", "<b>Bold</b> & co"],
    ]);
  });

  it("turns the literal \\n of RimWorld into real line breaks", () => {
    expect(keys(String.raw`<LanguageData><A>One\nTwo\n\nThree</A></LanguageData>`)).toEqual([
      ["A", "One\nTwo\n\nThree"],
    ]);
  });

  it("trims the spaces around a text, and keeps those inside", () => {
    expect(keys("<LanguageData><A>\n    Hello,  world\n  </A></LanguageData>")).toEqual([["A", "Hello,  world"]]);
  });

  it("skips empty, blank and self-closing elements, and comments", () => {
    const content = "<LanguageData><A/><B></B><C>  </C><!-- <D>x</D> --><E><!-- note -->text</E></LanguageData>";
    expect(keys(content)).toEqual([["E", "text"]]);
  });

  it("ignores the attributes of an element", () => {
    expect(keys('<LanguageData><A note="x">Hello</A></LanguageData>')).toEqual([["A", "Hello"]]);
  });

  it("reads files with a byte order mark and CRLF line endings", () => {
    const content = "\u{feff}<LanguageData>\r\n  <A>one</A>\r\n\r\n  <B>two</B>\r\n</LanguageData>\r\n";
    expect(read(content).map((o) => [o.location.line, o.source, o.group])).toEqual([
      [2, "one", `${keyedFile}#2`],
      [4, "two", `${keyedFile}#4`],
    ]);
  });

  it("only reads LanguageData files: LanguageInfo.xml and defs hold no translation", () => {
    expect(read("<LanguageInfo><friendlyNameEnglish>Test</friendlyNameEnglish></LanguageInfo>")).toEqual([]);
    expect(read("<Defs><ThingDef><label>bucket</label></ThingDef></Defs>")).toEqual([]);
  });

  it("rejects an element that mixes text and elements, naming the file and the line", () => {
    expect(() => read("<LanguageData>\n<A>Hello <b>you</b></A></LanguageData>")).toThrow(
      `${keyedFile}: invalid RimWorld file (line 2: <A> mixes text and elements; write markup as &lt;b&gt;)`,
    );
  });

  it.each([
    ["<LanguageData>\n<A>x</B>\n</LanguageData>", 2],
    ["<LanguageData>\n\n<A>x &nbsp; y</A></LanguageData>", 3],
    ["<LanguageData>\n<A>x</A>\n", 1],
  ])("reports syntax errors with the file and the line (%j)", (content, line) => {
    expect(() => read(content)).toThrow(ReadError);
    expect(() => read(content)).toThrow(new RegExp(`^${keyedFile}: invalid XML \\(line ${line}: `));
  });
});
