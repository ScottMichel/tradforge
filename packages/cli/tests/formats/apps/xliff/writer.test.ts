import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { xliffWriter } from "../../../../src/formats/apps/xliff/writer.js";
import { xliff12, xliff20 } from "./fixtures.js";

const translations = new Map([
  ["The Cold Forge", "La forge froide"],
  [
    'Welcome back, <x id="INTERPOLATION" equiv-text="{{ name }}"/>! Fish & chips?',
    'Bon retour, <x id="INTERPOLATION" equiv-text="{{ name }}"/> ! Poisson & frites ?',
  ],
  [
    'Press <g id="1" ctype="bold">Quit</g> to leave <now>',
    'Appuyez sur <g id="1" ctype="bold">Quitter</g> pour partir <maintenant>',
  ],
  ["The fire is out.", "Le feu est éteint."],
  [
    'Light it with <pc id="1">the <ph id="2" disp="{tool}"/></pc>.',
    'Allumez-le avec <pc id="1">le <ph id="2" disp="{tool}"/></pc>.',
  ],
]);

const write = (
  content: string,
  options: Partial<WriterInput["options"]> = {},
  translate: WriterInput["translate"] = (source) => translations.get(source),
) =>
  xliffWriter.write({
    file: "src/locale/messages.xlf",
    content,
    translate,
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target: "fr" },
  });

/** Applies exact replacements, each of which must be found. */
function replaced(text: string, ...pairs: [string, string][]): string {
  return pairs.reduce((result, [from, to]) => {
    expect(result).toContain(from);
    return result.replace(from, to);
  }, text);
}

describe("xliffWriter", () => {
  it("writes the targets of XLIFF 1.2 and names the target language of each file", () => {
    const result = write(xliff12);
    expect(result.content).toBe(
      replaced(
        xliff12,
        ['original="ng2.template">', 'original="ng2.template" target-language="fr">'],
        [
          "<source>The Cold Forge</source>\n",
          '<source>The Cold Forge</source>\n        <target state="translated">La forge froide</target>\n',
        ],
        [
          '<target state="new"></target>',
          '<target state="translated"> Bon retour, <x id="INTERPOLATION" equiv-text="{{ name }}"/> ! Poisson &amp; frites ? </target>',
        ],
        [
          "to leave &lt;now&gt;</source>\n",
          'to leave &lt;now&gt;</source>\n          <target state="translated">Appuyez sur <g id="1" ctype="bold">Quitter</g> pour partir &lt;maintenant&gt;</target>\n',
        ],
      ),
    );
    expect(result).toMatchObject({ translated: 3, untranslated: 0 });
  });

  it("writes the targets of XLIFF 2, in place of an empty target, and marks the segments translated", () => {
    const result = write(xliff20);
    expect(result.content).toBe(
      replaced(
        xliff20,
        ['srcLang="en">', 'srcLang="en" trgLang="fr">'],
        [
          "<source>The Cold Forge</source>\n",
          "<source>The Cold Forge</source>\n        <target>La forge froide</target>\n",
        ],
        ['<segment id="s1" state="initial">', '<segment id="s1" state="translated">'],
        ["<target/>", "<target>Le feu est éteint.</target>"],
        [
          "</pc>.</source>\n",
          '</pc>.</source>\n        <target>Allumez-le avec <pc id="1">le <ph id="2" disp="{tool}"/></pc>.</target>\n',
        ],
      ),
    );
    expect(result).toMatchObject({ translated: 3, untranslated: 0 });
  });

  it("replaces the target language already named", () => {
    const content = '<xliff version="2.0" srcLang="en" trgLang="de"><file id="f"/></xliff>';
    expect(write(content).content).toBe('<xliff version="2.0" srcLang="en" trgLang="fr"><file id="f"/></xliff>');
  });

  it("leaves an untranslated unit as it is, or leaves it out", () => {
    const only = (source: string) => (source === "The Cold Forge" ? "La forge froide" : undefined);
    const kept = write(xliff12, {}, only);
    expect(kept.content).toContain('<target state="new"></target>');
    expect(kept).toMatchObject({ translated: 1, untranslated: 2 });

    const omitted = write(xliff12, { untranslated: "omit" }, only).content;
    expect(omitted).not.toContain('id="welcome"');
    expect(omitted).not.toContain('id="quit"');
    expect(omitted).toContain('      </trans-unit>\n      <group id="menu">\n        <trans-unit id="logo"');
  });

  it("keeps a unit of several segments when one of them is translated, even with omit", () => {
    const only = (source: string) => (source === "The fire is out." ? "Le feu est éteint." : undefined);
    const omitted = write(xliff20, { untranslated: "omit" }, only).content;
    expect(omitted).not.toContain('<unit id="title">');
    expect(omitted).toContain('<unit id="story">');
  });

  it("escapes every character outside ASCII with asciiOnly", () => {
    expect(write(xliff20, { asciiOnly: true }).content).toContain("<target>Le feu est &#233;teint.</target>");
  });

  it("keeps CRLF line ends and leaves out the byte order mark", () => {
    const content = `\u{feff}${xliff20.replaceAll("\n", "\r\n")}`;
    const result = write(content).content;
    expect(result).toContain("<source>The Cold Forge</source>\r\n        <target>La forge froide</target>\r\n");
    expect(result.startsWith("<?xml")).toBe(true);
  });
});
