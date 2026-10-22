import { describe, expect, it } from "vitest";
import { extractLuaStrings, LuaSyntaxError } from "../../../../src/formats/games/lua/strings.js";

const values = (source: string) => extractLuaStrings(source).map((s) => s.value);

describe("extractLuaStrings", () => {
  it("reads double and single quoted strings, empty ones included", () => {
    expect(values(`local a = "Hello" b = 'World' c = ""`)).toEqual(["Hello", "World", ""]);
  });

  it("allows the other quote inside a string", () => {
    expect(values(`a = "It's" b = 'Say "hi"'`)).toEqual(["It's", 'Say "hi"']);
  });

  it("decodes the simple escapes", () => {
    expect(values(String.raw`a = "1\n2\t3\\4\"5\'6"`)).toEqual(["1\n2\t3\\4\"5'6"]);
  });

  it("decodes decimal escapes as UTF-8 bytes, three digits at most", () => {
    expect(values(String.raw`a = "Caf\195\169" b = "\65\066\0671"`)).toEqual(["Café", "ABC1"]);
  });

  it("decodes hexadecimal and unicode escapes", () => {
    expect(values(String.raw`a = "\x41\u{E9}\u{1F600}"`)).toEqual(["Aé😀"]);
  });

  it("handles escaped line breaks and \\z", () => {
    expect(values('a = "one\\\ntwo" b = "x\\z  \n   y"')).toEqual(["one\ntwo", "xy"]);
  });

  it("reads long strings verbatim, without their first line break", () => {
    // Raw part: a Lua backslash that must stay as it is. Normal part: real line breaks, CRLF included.
    const source = [String.raw`a = [[C:\path\n]] b = [[`, "\nHello\r\nWorld]]"].join("");
    expect(values(source)).toEqual([String.raw`C:\path\n`, "Hello\nWorld"]);
  });

  it("reads long strings with levels", () => {
    expect(values("a = [==[x ]] y ]=] z]==]")).toEqual(["x ]] y ]=] z"]);
  });

  it("ignores line and block comments", () => {
    const source = '-- "no"\nx = "yes" --[[ "no" ]] --[==[ "no ]] no" ]==]\n--[ "no"';
    expect(values(source)).toEqual(["yes"]);
  });

  it("does not take a minus sign for a comment", () => {
    expect(values('x = 1 - -2 .. "ok"')).toEqual(["ok"]);
  });

  it("reads strings used as table keys and call arguments", () => {
    expect(values(`t["key"] = f[[arg]]`)).toEqual(["key", "arg"]);
  });

  it("reports where each literal starts and ends, quotes and brackets included", () => {
    const source = 'x = "a\\"b" .. [==[c]==]';
    const spans = extractLuaStrings(source).map((s) => source.slice(s.start, s.end));
    expect(spans).toEqual(['"a\\"b"', "[==[c]==]"]);
  });

  it("reports the line where each string starts", () => {
    const lines = extractLuaStrings('"a"\r\n\n[[b\nc]] "d"').map((s) => s.line);
    expect(lines).toEqual([1, 3, 4]);
  });

  it.each([
    ['x = "oops\ny = 1', /line 1: unfinished string/],
    ["x = 1\ny = 'oops", /line 2: unfinished string/],
    ["x = [==[ never closed ]]", /line 1: unfinished long string/],
    ["--[[ never closed", /line 1: unfinished long comment/],
    [String.raw`x = "\q"`, /invalid escape sequence \\q/],
    [String.raw`x = "\256"`, /decimal escape too large/],
  ])("rejects %j", (source, message) => {
    expect(() => extractLuaStrings(source)).toThrow(LuaSyntaxError);
    expect(() => extractLuaStrings(source)).toThrow(message);
  });
});
