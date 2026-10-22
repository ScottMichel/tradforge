import { describe, expect, it } from "vitest";
import { ReadError } from "../../../../src/core/reader.js";
import { renpyReader } from "../../../../src/formats/games/renpy/reader.js";

const read = (content: string, extra: { context?: string } = {}) =>
  renpyReader.read({ file: "game/script.rpy", content, priority: 3, ...extra });
const sources = (content: string) => read(content).map((o) => o.source);

describe("renpyReader", () => {
  it("extracts dialogue, narration, extend and menu choices with label keys, lines and groups", () => {
    const script = [
      'define m = Character("Mira", color="#c8ffc8")', // 1: not marked for translation
      "",
      "label start:", // 3
      "    scene bg harbor", // 4
      '    "The harbor was quiet that night."', // 5
      '    m happy "You came back!"', // 6
      '    extend " I knew you would."', // 7
      "    menu:", // 8
      '        "Where do we go?"', // 9: caption
      '        "To the lighthouse":', // 10
      '            m "Follow me."', // 11
      '        "Back home" if tired:', // 12
      "            jump go_home", // 13
      "    return", // 14
      "",
      "label go_home:", // 16
      '    "The door creaked."', // 17
    ].join("\n");

    expect(read(script)).toEqual(
      [
        ["The harbor was quiet that night.", "start:1", 5, "start"],
        ["You came back!", "start:2", 6, "start"],
        [" I knew you would.", "start:3", 7, "start"],
        ["Where do we go?", "start:4", 9, "start"],
        ["To the lighthouse", "start:5", 10, "start"],
        ["Follow me.", "start:6", 11, "start"],
        ["Back home", "start:7", 12, "start"],
        ["The door creaked.", "go_home:1", 17, "go_home"],
      ].map(([source, key, line, label]) => ({
        source,
        location: { file: "game/script.rpy", key, line },
        priority: 3,
        group: `game/script.rpy#${label}`,
      })),
    );
  });

  it("passes the context of the source to every text", () => {
    expect(read('"Hi there."', { context: "visual novel" })[0]?.context).toBe("visual novel");
  });

  it("names local labels after their global label", () => {
    const script = 'label day1:\n    "Morning."\nlabel .evening:\n    "Evening."\nlabel day1.night:\n    "Night."\n';
    expect(read(script).map((o) => o.location.key)).toEqual(["day1:1", "day1.evening:1", "day1.night:1"]);
  });

  it("reads speakers given as strings, attributes, temporary attributes and statement clauses", () => {
    const script = [
      "label a(x=1):",
      '    "Stranger" "Who goes there?"',
      '    m -sad @ angry "Leave."',
      '    m.friend "Dotted speaker."',
      '    "Narration with a clause." with dissolve',
      '    "Arguments." (what_color="#f00")',
      '    m "Fixed id." id a_1234abcd',
      '    m "No wait." nointeract',
      '    centered "Chapter One"',
    ].join("\n");
    expect(sources(script)).toEqual([
      "Who goes there?",
      "Leave.",
      "Dotted speaker.",
      "Narration with a clause.",
      "Arguments.",
      "Fixed id.",
      "No wait.",
      "Chapter One",
    ]);
  });

  it("decodes Ren'Py strings: quotes, escapes, collapsed spaces, doubled brackets", () => {
    const script = [
      "label a:",
      "    m 'It\\'s fine.'",
      '    m "Say \\"hi\\"\\nto her."',
      '    m "Spread over',
      '       two lines."',
      '    m "\\{not a tag} and \\[not a variable]"',
      '    m "{b}Bold{/b}, {color=#f00}red{/color}{w} [player_name]!{nw}"',
      '    m "Visit {a=https://example.com}our site{/a}{p}Done {{ [[ 100\\%"',
    ].join("\n");
    expect(sources(script)).toEqual([
      "It's fine.",
      'Say "hi"\nto her.',
      "Spread over two lines.",
      "{{not a tag} and [[not a variable]",
      "{b}Bold{/b}, {color=#f00}red{/color}{w} [player_name]!{nw}",
      "Visit {a=https://example.com}our site{/a}{p}Done {{ [[ 100%%",
    ]);
  });

  it("splits triple-quoted dialogue into paragraphs, following rpy monologue", () => {
    const script = [
      "label a:", // 1
      '    m """', // 2
      "    First thought,", // 3
      "    still the first.", // 4
      "", // 5
      "    Second thought.", // 6
      '    """', // 7
      "    rpy monologue single", // 8
      '    """One.', // 9
      '    Two."""', // 10
    ].join("\n");
    expect(read(script).map((o) => [o.source, o.location.line])).toEqual([
      ["First thought, still the first.", 3],
      ["Second thought.", 6],
      ["One.", 9],
      ["Two.", 10],
    ]);
  });

  it("extracts strings marked with _(), __() and _p() wherever Python runs", () => {
    const script = [
      'define gui.about = _p("""A game about',
      '    boats.""")',
      'define e = Character(_("Eve"))',
      'default quest = "Find the key"', // not marked
      "init python:",
      '    title = _("The Long Night")',
      "    tip = __('Press \"space\" to go on')",
      "    def greet():",
      '        return _("Welcome back") + "!"',
      "label a:",
      '    $ renpy.notify(_("Game saved"))',
      '    show text _("Act II") at truecenter',
      "    python:",
      '        name = renpy.input(_("Your name?\\tPlease."), default="Ann")',
    ].join("\n");
    expect(read(script).map((o) => [o.source, o.location.key, o.group])).toEqual([
      ["A game about\n    boats.", "(top):1", undefined],
      ["Eve", "(top):2", undefined],
      ["The Long Night", "(top):3", undefined],
      ['Press "space" to go on', "(top):4", undefined],
      ["Welcome back", "(top):5", undefined],
      ["Game saved", "a:1", "game/script.rpy#a"],
      ["Act II", "a:2", "game/script.rpy#a"],
      ["Your name?\tPlease.", "a:3", "game/script.rpy#a"],
    ]);
  });

  it("extracts only the _() strings of screens, grouped by screen", () => {
    const script = [
      "screen main_menu():",
      '    text "Not marked"',
      "    vbox:",
      '        textbutton _("Start") action Start()',
      '        textbutton _("Quit") action Quit(confirm=True)',
      '        if renpy.variant("touch"):',
      '            text _("Tap to go on")',
    ].join("\n");
    expect(read(script).map((o) => [o.source, o.location.key, o.group])).toEqual([
      ["Start", "screen main_menu:1", "game/script.rpy#screen main_menu"],
      ["Quit", "screen main_menu:2", "game/script.rpy#screen main_menu"],
      ["Tap to go on", "screen main_menu:3", "game/script.rpy#screen main_menu"],
    ]);
  });

  it("skips code: statements, image names, paths, labels, comments and Python", () => {
    const script = [
      '# m "A comment"',
      'image bg harbor = "images/harbor night.png"',
      "transform slide:",
      "    xalign 0.5",
      "style say_label:",
      '    font "fonts/serif.ttf"',
      "label start:",
      '    play music "audio/waves.ogg" fadein 1.0',
      '    voice "voice/m_001.ogg"',
      "    show m happy at left with dissolve",
      '    $ mood = "happy"',
      '    jump expression "ending_" + mood',
      '    call screen choose("left")',
      '    if mood == "happy":',
      '        m "Glad you are here." # spoken',
      '    "..."', // no letter: nothing to translate
      '    m ""',
      '    m f"{mood}"', // not a Ren'Py string
      "python early:",
      '    config.name = "unmarked"',
    ].join("\n");
    expect(sources(script)).toEqual(["Glad you are here."]);
  });

  it("follows the indentation: nested blocks, ATL blocks, and the end of a screen or a python block", () => {
    const script = [
      "screen hud():",
      '    text _("Score")',
      "init:",
      '    define z = Character(_("Zed"))',
      "    python:",
      '        x = "not marked"',
      '    image glow = "glow.png"',
      "label a:",
      "    show m happy:",
      '        "glow.png"', // ATL, not dialogue
      "        xalign 0.5",
      "    menu named_menu:",
      '        "Left":',
      "            if met_zed:",
      '                z "Hello again."',
      "            else:",
      '                z "Who are you?"',
      '        "Right":',
      "            pass",
      '    "After the menu."',
    ].join("\n");
    expect(read(script).map((o) => [o.source, o.location.key])).toEqual([
      ["Score", "screen hud:1"],
      ["Zed", "(top):1"],
      ["Left", "a:1"],
      ["Hello again.", "a:2"],
      ["Who are you?", "a:3"],
      ["Right", "a:4"],
      ["After the menu.", "a:5"],
    ]);
  });

  it("skips the existing translate blocks", () => {
    const script = [
      "translate french start_1234abcd:",
      '    # m "Hello."',
      '    m "Bonjour."',
      "translate french strings:",
      '    old "Start"',
      '    new "Commencer"',
      "label start:",
      '    m "Hello."',
    ].join("\n");
    expect(sources(script)).toEqual(["Hello."]);
  });

  it("keeps the same keys when only the lines move", () => {
    const before = read('label a:\n    "One."\n    "Two."\n');
    const after = read('# new comment\n\nlabel a:\n\n    "One."\n    scene black\n    "Two."\n');
    expect(after.map((o) => o.location.key)).toEqual(before.map((o) => o.location.key));
  });

  it("reports a syntax error with the file name", () => {
    expect(() => read('label a:\n    m "unclosed\n')).toThrow(ReadError);
    expect(() => read('label a:\n    m "unclosed\n')).toThrow(/^game\/script\.rpy: invalid Ren'Py \(line 2:/);
  });
});
