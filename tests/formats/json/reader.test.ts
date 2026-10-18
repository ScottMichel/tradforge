import { describe, expect, it } from "vitest";
import { ReadError } from "../../../src/core/reader.js";
import { jsonReader } from "../../../src/formats/json/reader.js";

const read = (content: string) => jsonReader.read({ file: "locales/en/ui.json", content, priority: 1 });

const keysAndSources = (content: string) => read(content).map((o) => [o.location.key, o.source]);

describe("jsonReader", () => {
  it("reads the strings of a flat object, with their keys", () => {
    expect(keysAndSources('{"title": "Welcome", "quit": "Quit game"}')).toEqual([
      ["title", "Welcome"],
      ["quit", "Quit game"],
    ]);
  });

  it("joins nested keys with dots and uses indexes for arrays", () => {
    expect(keysAndSources('{"menu": {"start": "Start", "tips": ["Eat", "Sleep"]}}')).toEqual([
      ["menu.start", "Start"],
      ["menu.tips.0", "Eat"],
      ["menu.tips.1", "Sleep"],
    ]);
  });

  it("ignores values that are not text to translate", () => {
    const content = '{"n": 3, "on": true, "none": null, "empty": "", "blank": "  ", "hi": "Hi"}';
    expect(keysAndSources(content)).toEqual([["hi", "Hi"]]);
  });

  it("decodes escaped characters", () => {
    expect(keysAndSources('{"k": "Line 1\\nLine 2 \\u00e9"}')).toEqual([["k", "Line 1\nLine 2 é"]]);
  });

  it("records the file, priority and context of every occurrence", () => {
    const [occurrence] = jsonReader.read({
      file: "a.json",
      content: '{"k": "Hello"}',
      priority: 2,
      context: "main menu",
    });
    expect(occurrence).toStrictEqual({
      source: "Hello",
      location: { file: "a.json", key: "k" },
      priority: 2,
      context: "main menu",
    });
  });

  it("omits the context when none is given", () => {
    expect(read('{"k": "Hello"}')[0]).not.toHaveProperty("context");
  });

  it("accepts a UTF-8 byte order mark", () => {
    expect(keysAndSources('\uFEFF{"k": "Hello"}')).toEqual([["k", "Hello"]]);
  });

  it("names the file when the JSON is invalid", () => {
    const readBroken = () => read('{"k": "Hello",}');
    expect(readBroken).toThrow(ReadError);
    expect(readBroken).toThrow(/locales\/en\/ui\.json/);
  });
});
