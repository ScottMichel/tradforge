import { describe, expect, it } from "vitest";
import { gettextLanguage, pluralForms } from "../../../src/formats/po/plurals.js";

describe("pluralForms", () => {
  it("gives the gettext plural rule of a language, and the form used for one", () => {
    expect(pluralForms("fr")).toEqual({ count: 2, expression: "(n > 1)", one: 0 });
    expect(pluralForms("de")).toEqual({ count: 2, expression: "(n != 1)", one: 0 });
    expect(pluralForms("ru")?.count).toBe(3);
    expect(pluralForms("ar")).toMatchObject({ count: 6, one: 1 });
  });

  it("has no form for one in languages with a single form", () => {
    expect(pluralForms("ja")).toEqual({ count: 1, expression: "0", one: undefined });
  });

  it("follows the region when it changes the rule, the language otherwise", () => {
    expect(pluralForms("pt-BR")?.expression).toBe("(n > 1)");
    expect(pluralForms("pt")?.expression).toBe("(n != 1)");
    expect(pluralForms("fr_CA")?.expression).toBe("(n > 1)");
    expect(pluralForms("ES-mx")?.expression).toBe("(n != 1)");
  });

  it("knows nothing of an unknown language", () => {
    expect(pluralForms("tlh")).toBeUndefined();
  });
});

describe("gettextLanguage", () => {
  it("writes the region after an underscore, as gettext does", () => {
    expect(gettextLanguage("pt-BR")).toBe("pt_BR");
    expect(gettextLanguage("fr")).toBe("fr");
    expect(gettextLanguage("zh-hant-TW")).toBe("zh_Hant_TW");
  });
});
