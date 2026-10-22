import { describe, expect, it } from "vitest";
import { parseConfig, SOURCE_FORMATS } from "../../src/core/config.js";
import { effectivePlaceholders, FORMATS, formatOf, withFormatPlaceholders } from "../../src/formats/registry.js";

const minimal = { sourceLanguage: "en", targetLanguage: "fr", sources: [{ format: "json", include: ["*.json"] }] };

describe("FORMATS", () => {
  it("describes every source format, with a reader and a writer of that format", () => {
    for (const format of SOURCE_FORMATS) {
      expect(FORMATS[format].id).toBe(format);
      expect(FORMATS[format].reader.format).toBe(format);
      expect(FORMATS[format].writer.format).toBe(format);
    }
  });

  it("gives every extension to one format only", () => {
    const owners = new Map<string, string>();
    for (const format of SOURCE_FORMATS) {
      for (const extension of FORMATS[format].extensions) {
        expect(owners.get(extension), extension).toBeUndefined();
        expect(extension).toBe(extension.toLowerCase());
        owners.set(extension, format);
      }
    }
    expect(formatOf("media/lua/Camp.LUA")).toBe("lua");
  });
});

describe("effectivePlaceholders", () => {
  it("adds the placeholder syntaxes of the formats used by the project", () => {
    expect(effectivePlaceholders(parseConfig(minimal))).not.toContain("paradox");
    const paradox = parseConfig({
      ...minimal,
      sources: [...minimal.sources, { format: "paradox-yml", include: ["l/*.yml"] }],
    });
    expect(effectivePlaceholders(paradox)).toContain("paradox");
    const none = parseConfig({
      ...minimal,
      sources: [{ format: "paradox-yml", include: ["x"] }],
      validation: { placeholders: [] },
    });
    expect(effectivePlaceholders(none)).toEqual(["paradox"]);
  });

  it("gives the pipeline a configuration with those syntaxes", () => {
    const config = parseConfig({ ...minimal, sources: [{ format: "markdown", include: ["*.md"] }] });
    expect(config.validation.placeholders).not.toContain("markdown");
    expect(withFormatPlaceholders(config).validation.placeholders).toContain("markdown");
  });
});
