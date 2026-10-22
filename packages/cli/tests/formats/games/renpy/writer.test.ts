import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { renpyReader } from "../../../../src/formats/games/renpy/reader.js";
import { renpyWriter } from "../../../../src/formats/games/renpy/writer.js";

const translations = new Map([
  ["The harbor was quiet that night.", "Le port était calme cette nuit-là."],
  ["You came back!", "Tu es revenu !"],
  [" I knew you would.", " Je le savais."],
  ["To the lighthouse", "Au phare"],
  ["It's fine.", "C'est bon."],
  ['Say "hi"\nto her.', "Dis « salut »\nà elle."],
  ["{b}Bold{/b} and [player_name]{w}", "{b}Gras{/b} et [player_name]{w}"],
  ["Spread over two lines.", "Sur  deux lignes."],
  ["First thought.", "Première pensée."],
  ["Start", "Commencer"],
  ["The Long Night", "La longue nuit"],
  ["unmarked", "never used"], // code: must never be replaced
]);

const write = (content: string, options: Partial<WriterInput["options"]> = {}) =>
  renpyWriter.write({
    file: "game/script.rpy",
    content,
    translate: (source) => translations.get(source),
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target: "fr" },
  });

const script = `# "You came back!" in a comment stays as it is
define config.name = "unmarked"
init python:
    title = _("The Long Night")

screen main_menu():
    textbutton _('Start') action Start()

label start:
    scene bg harbor
    "The harbor was quiet that night."
    m happy "You came back!" with dissolve
    extend " I knew you would."
    m 'It\\'s fine.'
    m "Say \\"hi\\"\\nto her."
    m "{b}Bold{/b} and [player_name]{w}"
    m "Spread over
       two lines."
    m """
    First thought.

    Second thought.
    """
    menu:
        "To the lighthouse" if True:
            m "Not translated yet."
`;

describe("renpyWriter", () => {
  it("replaces the translated texts in place and leaves everything else byte for byte", () => {
    const result = write(script);
    expect(result.content).toBe(`# "You came back!" in a comment stays as it is
define config.name = "unmarked"
init python:
    title = _("La longue nuit")

screen main_menu():
    textbutton _('Commencer') action Start()

label start:
    scene bg harbor
    "Le port était calme cette nuit-là."
    m happy "Tu es revenu !" with dissolve
    extend " Je le savais."
    m 'C\\'est bon.'
    m "Dis « salut »\\nà elle."
    m "{b}Gras{/b} et [player_name]{w}"
    m "Sur \\ deux lignes."
    m """Première pensée.

Second thought."""
    menu:
        "Au phare" if True:
            m "Not translated yet."
`);
    expect(result).toMatchObject({ translated: 11, untranslated: 2 });
  });

  it("returns the content unchanged when nothing is translated", () => {
    const content = 'label a:\n    m "Nothing here."\n';
    expect(write(content)).toEqual({ content, translated: 0, untranslated: 1 });
  });

  it("keeps the byte order mark and Windows line breaks", () => {
    const content = '\u{feff}label a:\r\n    m """First thought.\r\n\r\n    Second thought."""\r\n    m "Start"\r\n';
    expect(write(content).content).toBe(
      '\u{feff}label a:\r\n    m """Première pensée.\r\n\r\nSecond thought."""\r\n    m "Commencer"\r\n',
    );
  });

  it("escapes non-ASCII characters when asked to", () => {
    const content = write(script, { asciiOnly: true }).content;
    expect(content).toContain('"Le port \\u00e9tait calme cette nuit-l\\u00e0."');
    expect(content).toContain('_("La longue nuit")');
    expect([...content].every((char) => (char.codePointAt(0) ?? 0) <= 0x7f)).toBe(true);
  });

  it("writes a script that the reader reads back as the translations", () => {
    for (const asciiOnly of [false, true]) {
      const written = write(script, { asciiOnly }).content;
      const read = renpyReader.read({ file: "game/script.rpy", content: written, priority: 0 });
      expect(read.map((o) => o.source)).toEqual([
        "La longue nuit",
        "Commencer",
        "Le port était calme cette nuit-là.",
        "Tu es revenu !",
        " Je le savais.",
        "C'est bon.",
        "Dis « salut »\nà elle.",
        "{b}Gras{/b} et [player_name]{w}",
        "Sur  deux lignes.",
        "Première pensée.",
        "Second thought.",
        "Au phare",
        "Not translated yet.",
      ]);
      const original = renpyReader.read({ file: "game/script.rpy", content: script, priority: 0 });
      expect(read.map((o) => o.location)).toEqual(original.map((o) => ({ ...o.location, line: expect.any(Number) })));
    }
  });

  it("writes Python strings that Python reads back, even from raw and triple-quoted literals", () => {
    const content = 'init python:\n    a = _(r"Start")\n    b = _p("""The Long\n    Night""")\n';
    const own = new Map([
      ["Start", 'Dé\\but "ici"'],
      ["The Long\n    Night", "La\nnuit"],
    ]);
    const result = renpyWriter.write({
      file: "game/x.rpy",
      content,
      translate: (source) => own.get(source),
      options: { asciiOnly: false, untranslated: "keep-source" },
      languages: { source: "en", target: "fr" },
    });
    expect(result.content).toBe('init python:\n    a = _("Dé\\\\but \\"ici\\"")\n    b = _p("La\\nnuit")\n');
    const read = renpyReader.read({ file: "game/x.rpy", content: result.content, priority: 0 });
    expect(read.map((o) => o.source)).toEqual(['Dé\\but "ici"', "La\nnuit"]);
  });
});
