import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import { poReader } from "../../../../src/formats/apps/po/reader.js";

const file = "po/forge.pot";
const read = (content: string, context?: string) =>
  poReader.read({ file, content, priority: 2, ...(context !== undefined ? { context } : {}) });

const catalog = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"

#. TRANSLATORS: the title of the main window
#: src/window.c:12
msgctxt "window"
msgid "The Cold Forge"
msgstr ""

msgid "One bar"
msgid_plural "%d bars"
msgstr[0] ""
msgstr[1] ""

msgid "Already translated"
msgstr "Déjà traduit"

#~ msgid "Old text"
#~ msgstr ""
`;

describe("poReader", () => {
  it("reads every msgid, and the plural of plural entries, but neither the header nor obsolete entries", () => {
    expect(read(catalog).map((occurrence) => occurrence.source)).toEqual([
      "The Cold Forge",
      "One bar",
      "%d bars",
      "Already translated",
    ]);
  });

  it("gives the context of the entry and the notes of the developers as context", () => {
    const [title, bar] = read(catalog, "a game about smiths");
    expect(title).toStrictEqual({
      source: "The Cold Forge",
      location: { file, key: "window", line: 8 },
      priority: 2,
      context: "a game about smiths | window | TRANSLATORS: the title of the main window",
    });
    expect(bar?.context).toBe("a game about smiths");
  });

  it("puts the singular and the plural of an entry in one group, so that they are translated together", () => {
    const [, singular, plural, other] = read(catalog);
    expect(singular).toMatchObject({ location: { file, line: 11 }, group: `${file}#11` });
    expect(plural).toMatchObject({ location: { file, line: 12 }, group: `${file}#11` });
    expect(other?.group).toBeUndefined();
  });

  it("leaves out entries with an empty msgid in a context: there is nothing to translate", () => {
    expect(read('msgctxt "menu"\nmsgid ""\nmsgstr ""\n')).toEqual([]);
  });

  it("names the file of a broken catalog", () => {
    expect(() => read('msgid "A"\n')).toThrow(ReadError);
  });
});
