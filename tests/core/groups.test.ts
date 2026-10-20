import { describe, expect, it } from "vitest";
import { groupRule } from "../../src/core/groups.js";
import type { Occurrence } from "../../src/core/types.js";

const occurrence = (key?: string, group?: string): Occurrence => ({
  source: "Hello",
  priority: 0,
  location: { file: "dialogs.txt", ...(key !== undefined ? { key } : {}) },
  ...(group !== undefined ? { group } : {}),
});

describe("groupRule", () => {
  it("keeps the group of the reader with auto", () => {
    expect(groupRule("auto")(occurrence("a", "dialogs.txt#bob")).group).toBe("dialogs.txt#bob");
  });

  it("removes groups with none, and makes one group per file with file", () => {
    expect(groupRule("none")(occurrence("a", "dialogs.txt#bob"))).not.toHaveProperty("group");
    expect(groupRule("file")(occurrence("a", "dialogs.txt#bob")).group).toBe("dialogs.txt");
  });

  it("groups texts whose keys give the same first capture group", () => {
    const rule = { keyPattern: "^Dialog_(\\w+?)_\\d+$" };
    expect(groupRule(rule)(occurrence("Dialog_Bob_01")).group).toBe("dialogs.txt#Bob");
    expect(groupRule(rule)(occurrence("Dialog_Bob_02")).group).toBe("dialogs.txt#Bob");
    expect(groupRule(rule)(occurrence("Dialog_Ann_01")).group).toBe("dialogs.txt#Ann");
  });

  it("uses the whole match without a capture group, and no group when the key does not match", () => {
    expect(groupRule({ keyPattern: "^menu" })(occurrence("menu_play")).group).toBe("dialogs.txt#menu");
    expect(groupRule({ keyPattern: "^Dialog" })(occurrence("title", "dialogs.txt#"))).not.toHaveProperty("group");
    expect(groupRule({ keyPattern: "^x" })(occurrence(undefined, "dialogs.txt#3"))).not.toHaveProperty("group");
  });
});
