import { describe, expect, it } from "vitest";
import type { TranslationRequest } from "../../../src/core/provider.js";
import { buildSystemPrompt, buildUserMessage, languageName } from "../../../src/providers/llm/prompt.js";

const request = (overrides: Partial<TranslationRequest> = {}): TranslationRequest => ({
  sourceLanguage: "en",
  targetLanguage: "fr",
  items: [
    { id: 0, source: "Talk to the NPC", context: "quest log" },
    { id: 1, source: "Hello {name}" },
  ],
  ...overrides,
});

describe("languageName", () => {
  it("turns a language code into an English name, and keeps unknown codes", () => {
    expect(languageName("fr")).toBe("French");
    expect(languageName("pt-BR")).toBe("Brazilian Portuguese");
    expect(languageName("not a code")).toBe("not a code");
  });
});

describe("buildSystemPrompt", () => {
  it("names the languages and states the rules the validation enforces", () => {
    const prompt = buildSystemPrompt(request());
    expect(prompt).toContain("from English to French");
    expect(prompt).toMatch(/placeholder/i);
    expect(prompt).toMatch(/never .*add/i);
    expect(prompt).toMatch(/line breaks/i);
    expect(prompt).toContain('{"translations":[{"id":');
  });

  it("includes the project instructions only when there are some", () => {
    expect(buildSystemPrompt(request({ instructions: "Casual tone, use tu." }))).toContain("Casual tone, use tu.");
    expect(buildSystemPrompt(request())).not.toContain("Project instructions");
  });

  it("only lists the glossary terms used in the batch, ignoring case", () => {
    const prompt = buildSystemPrompt(request({ glossary: { npc: "PNJ", HP: "PV" } }));
    expect(prompt).toContain("npc → PNJ");
    expect(prompt).not.toContain("HP → PV");
    expect(buildSystemPrompt(request({ glossary: { HP: "PV" } }))).not.toContain("Glossary");
  });
});

describe("buildUserMessage", () => {
  it("sends the texts as JSON, with their id and context", () => {
    expect(JSON.parse(buildUserMessage(request()))).toEqual({
      texts: [
        { id: 0, text: "Talk to the NPC", context: "quest log" },
        { id: 1, text: "Hello {name}" },
      ],
    });
  });

  it("adds the surrounding lines and the previous versions, when there are some", () => {
    const message = buildUserMessage(
      request({
        items: [{ id: 0, source: "Quit the game?", previous: { source: "Quit game?", translation: "Quitter ?" } }],
        surrounding: { before: [{ source: "Leaving?", translation: "Tu pars ?" }], after: [{ source: "Bye." }] },
      }),
    );
    expect(JSON.parse(message)).toEqual({
      before: [{ text: "Leaving?", translation: "Tu pars ?" }],
      texts: [{ id: 0, text: "Quit the game?", previous: { text: "Quit game?", translation: "Quitter ?" } }],
      after: [{ text: "Bye." }],
    });
  });
});

describe("buildSystemPrompt with context", () => {
  it("explains the surrounding lines and the previous versions only when they are sent", () => {
    const plain = buildSystemPrompt(request());
    expect(plain).not.toContain('"before"');
    expect(plain).not.toContain('"previous"');
    const rich = buildSystemPrompt(
      request({
        items: [{ id: 0, source: "Hi", previous: { source: "Hi!", translation: "Salut !" } }],
        surrounding: { before: [{ source: "Hey" }], after: [] },
      }),
    );
    expect(rich).toMatch(/"before" and "after".*never translate/);
    expect(rich).toMatch(/"previous".*same wording/);
  });
});
