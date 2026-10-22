import { describe, expect, it } from "vitest";
import { editJsonc } from "../../src/storage/jsonc.js";

const CONFIG = `{
  // Language of the texts.
  "sourceLanguage": "en",
  "targetLanguage": "fr", // trailing note

  /* The engine. */
  "provider": { "type": "ollama", "model": "mistral-small" },

  "translation": {
    // Sent with every batch.
    "instructions": "Video game texts.",
    "batchSize": 20
  }
}
`;

describe("editJsonc", () => {
  it("replaces a value and keeps every comment and the layout", () => {
    const edited = editJsonc(CONFIG, ["targetLanguage"], "de");
    expect(edited).toBe(CONFIG.replace('"targetLanguage": "fr"', '"targetLanguage": "de"'));
  });

  it("replaces a nested value, and a whole object written on several lines", () => {
    expect(editJsonc(CONFIG, ["translation", "instructions"], "A tabletop game.")).toContain(
      '    // Sent with every batch.\n    "instructions": "A tabletop game.",',
    );
    const provider = editJsonc(CONFIG, ["provider"], { type: "deepl", formality: "less" });
    expect(provider).toContain(
      '  /* The engine. */\n  "provider": {\n    "type": "deepl",\n    "formality": "less"\n  },\n',
    );
  });

  it("adds a missing property at the end of its object, with the indentation of its neighbours", () => {
    expect(editJsonc(CONFIG, ["translation", "glossary"], { NPC: "PNJ" })).toContain(
      '    "batchSize": 20,\n    "glossary": {\n      "NPC": "PNJ"\n    }\n  }',
    );
    expect(editJsonc("{}", ["workDir"], ".tradforge")).toBe('{\n  "workDir": ".tradforge"\n}');
    expect(editJsonc('{ "a": {} }', ["a", "b"], 1)).toBe('{ "a": {\n  "b": 1\n} }');
  });

  it("creates the missing objects on the way", () => {
    expect(JSON.parse(editJsonc('{ "a": 1 }', ["validation", "glossary"], true))).toEqual({
      a: 1,
      validation: { glossary: true },
    });
  });

  it("removes a property and its comma", () => {
    const removed = editJsonc(CONFIG, ["translation", "instructions"], undefined);
    expect(removed).toContain('  "translation": {\n    // Sent with every batch.\n    "batchSize": 20\n  }');
    const last = editJsonc(CONFIG, ["translation", "batchSize"], undefined);
    expect(last).toContain('    "instructions": "Video game texts."\n  }');
    expect(JSON.parse(editJsonc('{ "a": 1, "b": 2 }', ["b"], undefined))).toEqual({ a: 1 });
    expect(editJsonc(CONFIG, ["missing"], undefined)).toBe(CONFIG);
  });

  it("is not fooled by braces, quotes and comment marks inside strings", () => {
    const tricky = '{ "a": "x } // \\" /* y", "b": 1 }';
    expect(JSON.parse(editJsonc(tricky, ["b"], 2))).toEqual({ a: 'x } // " /* y', b: 2 });
  });

  it("refuses a text that is not a JSON object", () => {
    expect(() => editJsonc("[1, 2]", ["a"], 1)).toThrow(/object/);
    expect(() => editJsonc('{ "a": 1', ["a"], 2)).toThrow();
    expect(() => editJsonc('{ "a": 1 }', ["a", "b"], 2)).toThrow(/a is not an object/);
  });
});
