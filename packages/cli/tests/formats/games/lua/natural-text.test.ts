import { describe, expect, it } from "vitest";
import { isNaturalText } from "../../../../src/formats/games/lua/natural-text.js";

describe("isNaturalText", () => {
  it.each([
    "Hello",
    "Quit",
    "OK",
    "Été",
    "Wait...",
    "Welcome to the camp!",
    "You have %d coins.",
    "Hello, {name}!",
    "100% sure",
    "player_id is missing",
  ])("keeps %j", (text) => {
    expect(isNaturalText(text)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "42",
    "---",
    "%s: %d",
    "^%s*(.-)%s*$",
    "player_id",
    "MAX_HEALTH",
    "idle",
    "item2",
    "onPlayerDeath",
    "PlayerDeath",
    "Base.Axe",
    "ui:close",
    "media/ui/icon.png",
    "C:\\mods\\camp",
    "https://example.com",
    "hp=%d",
    "[debug] id=42",
  ])("rejects %j", (text) => {
    expect(isNaturalText(text)).toBe(false);
  });
});
