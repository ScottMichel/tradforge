import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { yamlReader } from "../../../../src/formats/apps/yaml/reader.js";
import { yamlWriter } from "../../../../src/formats/apps/yaml/writer.js";

const file = "config/locales/en.yml";

const write = (
  content: string,
  table: Record<string, string>,
  options: Partial<WriterInput["options"]> = {},
  target = "fr",
) =>
  yamlWriter.write({
    file,
    content,
    translate: (source) => table[source],
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target },
  });

describe("yamlReader", () => {
  it("reads every text with its key, grouped by the mapping or list that holds it", () => {
    const content = "en:\n  menu:\n    quit: Quit\n    load: 'Load'\n  enabled: true\n  days: [Sunday]\n";
    const occurrences = yamlReader.read({ file, content, priority: 0, context: "a game" });
    expect(occurrences).toEqual([
      {
        source: "Quit",
        location: { file, key: "en.menu.quit", line: 3 },
        priority: 0,
        context: "a game",
        group: `${file}#en.menu`,
      },
      {
        source: "Load",
        location: { file, key: "en.menu.load", line: 4 },
        priority: 0,
        context: "a game",
        group: `${file}#en.menu`,
      },
      {
        source: "Sunday",
        location: { file, key: "en.days.0", line: 6 },
        priority: 0,
        context: "a game",
        group: `${file}#en.days`,
      },
    ]);
  });
});

describe("yamlWriter", () => {
  it("replaces each text in place, renames the language key, and keeps comments and layout", () => {
    const content = `# Texts of the forge
en:
  title: The Cold Forge   # shown in the title bar
  quoted: "Say \\"hello\\""
  single: 'Fish & chips'
  enabled: true
  days: [Sunday, 'Monday']
`;
    const result = write(content, {
      "The Cold Forge": "La forge froide",
      'Say "hello"': "Dites « bonjour »",
      "Fish & chips": "Poisson-frites",
      Sunday: "Dimanche",
      Monday: "Lundi",
    });
    expect(result.content).toBe(`# Texts of the forge
fr:
  title: La forge froide   # shown in the title bar
  quoted: "Dites « bonjour »"
  single: 'Poisson-frites'
  enabled: true
  days: [Dimanche, 'Lundi']
`);
    expect(result).toMatchObject({ translated: 5, untranslated: 0 });
  });

  it("quotes a plain translation that YAML would read otherwise", () => {
    const content = "a: Not this\nb: Done\nc: Key\nd: Item\nlist: [One, Two]\n";
    const result = write(content, {
      "Not this": "No",
      Done: "Fini : oui",
      Key: "#1",
      Item: "  spaced",
      One: "Un, deux",
      Two: "C'est ça",
    }).content;
    expect(result).toBe('a: "No"\nb: "Fini : oui"\nc: "#1"\nd: "  spaced"\nlist: ["Un, deux", C\'est ça]\n');
  });

  it("writes line breaks in a block when the source is a block, in double quotes otherwise", () => {
    const content = `literal: |
  Two
  lines
folded: >-
  One
  line
other: >
  Folded
single: 'A single line'
`;
    const result = write(content, {
      "Two\nlines\n": "Deux\nlignes\n",
      "A single line": "Une\nligne",
      "Folded\n": "Plié\nsur deux lignes\n",
    }).content;
    expect(result).toBe(`literal: |
  Deux
  lignes
folded: >-
  One
  line
other: |
  Plié
  sur deux lignes
single: "Une\\nligne"
`);
  });

  it("keeps a folded translation without line break folded", () => {
    expect(write("a: >-\n  Long\n  text\n", { "Long text": "Texte long" }).content).toBe("a: >-\n  Texte long\n");
  });

  it("writes a quoted string that spanned several lines on one line", () => {
    const content = 'a: "Long\n  text"\nb: next\n';
    expect(write(content, { "Long text": "Texte long" }).content).toBe('a: "Texte long"\nb: next\n');
  });

  it("leaves untranslated texts as they are, or leaves their entries out", () => {
    const content = "en:\n  a: Kept\n  b: Gone\n  list:\n    - Gone\n";
    const kept = write(content, { Kept: "Gardé" });
    expect(kept.content).toBe("fr:\n  a: Gardé\n  b: Gone\n  list:\n    - Gone\n");
    expect(kept).toMatchObject({ translated: 1, untranslated: 2 });
    // A list item stays: leaving it out would shift the next ones.
    expect(write(content, { Kept: "Gardé" }, { untranslated: "omit" }).content).toBe(
      "fr:\n  a: Gardé\n  list:\n    - Gone\n",
    );
  });

  it("escapes every character outside ASCII with asciiOnly", () => {
    expect(write("a: Summer\n", { Summer: "Été 😀" }, { asciiOnly: true }).content).toBe(
      'a: "\\u00c9t\\u00e9 \\U0001f600"\n',
    );
  });

  it("keeps CRLF line ends and leaves out the byte order mark", () => {
    const content = "\u{feff}en:\r\n  a: |\r\n    One\r\n    two\r\n";
    expect(write(content, { "One\ntwo\n": "Un\ndeux\n" }).content).toBe("fr:\r\n  a: |\r\n    Un\r\n    deux\r\n");
  });
});
