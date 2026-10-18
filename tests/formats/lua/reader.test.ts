import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import { luaReader } from "../../../src/formats/lua/reader.js";

const file = "media/lua/client/camp.lua";
const read = (content: string) => luaReader.read({ file, content, priority: 1 });

const script = `local Camp = {}
Camp.title = "Welcome to the camp"
Camp.state = "idle"
Camp.icon = getTexture("media/ui/camp.png")
-- Camp.old = "Old text"
function Camp.greet(player)
  print("[debug] id=" .. player:getID())
  player:Say(string.format("Hello, %s!", player:getName()))
end
return Camp
`;

describe("luaReader", () => {
  it("reads the natural-language strings with their line, and skips code strings", () => {
    expect(read(script).map((o) => [o.location.line, o.source])).toEqual([
      [2, "Welcome to the camp"],
      [8, "Hello, %s!"],
    ]);
  });

  it("records the file, line, priority and context of every occurrence", () => {
    const [occurrence] = luaReader.read({ file, content: 'x = "Good night"', priority: 3, context: "dialogue" });
    expect(occurrence).toStrictEqual({
      source: "Good night",
      location: { file, line: 1 },
      priority: 3,
      context: "dialogue",
    });
  });

  it("omits the context when none is given", () => {
    expect(read('x = "Good night"')[0]).not.toHaveProperty("context");
  });

  it("keeps the exact source text, surrounding spaces included", () => {
    expect(read('x = "  Good night  "')[0]?.source).toBe("  Good night  ");
  });

  it("accepts a UTF-8 byte order mark", () => {
    expect(read('﻿x = "Good night"').map((o) => o.source)).toEqual(["Good night"]);
  });

  it("names the file and the line when the Lua is invalid", () => {
    const readBroken = () => read('x = 1\ny = "never closed');
    expect(readBroken).toThrow(ReadError);
    expect(readBroken).toThrow(/media\/lua\/client\/camp\.lua.*line 2: unfinished string/);
  });
});
