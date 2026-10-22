import path from "node:path";
import { describe, expect, it } from "vitest";
import { openProject } from "../src/cli/config-file.js";
import { extractSegments } from "../src/formats/project/extract.js";

describe("the example project", () => {
  it("has a valid configuration and only extracts texts meant for players", async () => {
    const project = await openProject(path.join(import.meta.dirname, "..", "examples", "game"));
    const sources = (await extractSegments(project.root, project.config)).map((segment) => segment.source);
    expect(sources).toHaveLength(13);
    expect(sources.slice(0, 3)).toEqual([
      "*yawns* Another one. Welcome to the camp.",
      "You look tired, %s.\nGet some rest by the fire.",
      "Don't go back to town before nightfall.",
    ]);
    expect(sources).not.toContain("idle");
    expect(sources).not.toContain("media/ui/portraits/guard.png");
  });
});
