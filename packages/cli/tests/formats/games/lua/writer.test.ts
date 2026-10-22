import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { luaReader } from "../../../../src/formats/games/lua/reader.js";
import { extractLuaStrings } from "../../../../src/formats/games/lua/strings.js";
import { encodeLuaString, luaWriter } from "../../../../src/formats/games/lua/writer.js";

const translations = new Map([
  ["Welcome to the camp", "Bienvenue au camp"],
  ['Say "hi"\nto him', 'Dis "salut"\nà lui'],
  ["It's late", "Il est tard"],
  ["A long text", "Un long texte"],
  ["idle", "inactif"], // must never be used: "idle" is code, not text
]);

const write = (content: string, options: Partial<WriterInput["options"]> = {}) =>
  luaWriter.write({
    file: "lua/camp.lua",
    content,
    translate: (source) => translations.get(source),
    options: { asciiOnly: false, untranslated: "keep-source", ...options },
    languages: { source: "en", target: "fr" },
  });

const script = `-- "Welcome to the camp" in a comment stays as it is
local state = "idle"
player:Say("Welcome to the camp") -- greeting
player:Say('It\\'s late')
player:Say("Say \\"hi\\"\\nto him")
local long = [[A long text]]
player:Say("Not translated yet")
`;

describe("luaWriter", () => {
  it("replaces the translated texts in place and leaves the code byte for byte", () => {
    const result = write(script);
    expect(result.content).toBe(`-- "Welcome to the camp" in a comment stays as it is
local state = "idle"
player:Say("Bienvenue au camp") -- greeting
player:Say('Il est tard')
player:Say("Dis \\"salut\\"\\nà lui")
local long = "Un long texte"
player:Say("Not translated yet")
`);
    expect(result).toMatchObject({ translated: 4, untranslated: 1 });
  });

  it("escapes non-ASCII characters as UTF-8 decimal bytes when asked to", () => {
    const content = write(script, { asciiOnly: true }).content;
    expect(content).toContain('player:Say("Dis \\"salut\\"\\n\\195\\160 lui")');
    expect([...content].every((char) => (char.codePointAt(0) ?? 0) <= 0x7f)).toBe(true);
  });

  it("writes code that the Lua reader reads back as the translations", () => {
    for (const asciiOnly of [false, true]) {
      const written = write(script, { asciiOnly }).content;
      const read = luaReader.read({ file: "camp.fr.lua", content: written, priority: 0 }).map((o) => o.source);
      expect(read).toEqual([
        "Bienvenue au camp",
        "Il est tard",
        'Dis "salut"\nà lui',
        "Un long texte",
        "Not translated yet",
      ]);
    }
  });
});

describe("encodeLuaString", () => {
  it.each([
    ["plain", '"', false],
    ['quote " and backslash \\', '"', false],
    ["single ' quote", "'", false],
    ["tab\tbell\x07 zero\x00 then 1", '"', false],
    ["\\065 is not A", '"', false],
    ["Été 😀", '"', true],
    ["Été 😀", "'", false],
  ] as const)("round-trips %j", (value, quote, asciiOnly) => {
    const literal = encodeLuaString(value, quote, asciiOnly);
    expect(extractLuaStrings(literal).map((s) => s.value)).toEqual([value]);
  });

  it("pads decimal escapes to three digits, so a following digit is not swallowed", () => {
    expect(encodeLuaString("\x001", '"', false)).toBe('"\\0001"');
  });
});
