import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_FILE,
  CONFIG_TEMPLATE,
  ConfigFileError,
  openProject,
  stripJsonComments,
} from "../../src/cli/config-file.js";

describe("stripJsonComments", () => {
  it("removes line and block comments, but never inside strings", () => {
    const text = '{\n  // a comment\n  "url": "http://host//path", /* block\n comment */ "a": "/* kept */"\n}';
    expect(JSON.parse(stripJsonComments(text))).toEqual({ url: "http://host//path", a: "/* kept */" });
  });

  it("keeps escaped quotes inside strings", () => {
    expect(JSON.parse(stripJsonComments('{"a": "say \\"hi\\" // not a comment"} // comment'))).toEqual({
      a: 'say "hi" // not a comment',
    });
  });

  it("keeps line numbers, so that JSON errors still point at the right line", () => {
    const text = "{\n/* one\ntwo */\n}";
    expect(stripJsonComments(text).split("\n")).toHaveLength(4);
  });
});

describe("openProject", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tradforge-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("loads the commented template that init writes", async () => {
    await writeFile(path.join(root, CONFIG_FILE), CONFIG_TEMPLATE);
    const project = await openProject(root);
    expect(project.root).toBe(root);
    expect(project.config.targetLanguage).toBe("fr");
    expect(project.workDir).toBe(path.join(root, ".tradforge"));
  });

  it("takes the project root from the folder of an explicit config file", async () => {
    await writeFile(path.join(root, "custom.json"), CONFIG_TEMPLATE);
    const project = await openProject(tmpdir(), path.join(root, "custom.json"));
    expect(project.root).toBe(root);
  });

  it("suggests init when there is no configuration", async () => {
    await expect(openProject(root)).rejects.toThrow(ConfigFileError);
    await expect(openProject(root)).rejects.toThrow(/tradforge init/);
  });

  it("names the file for invalid JSON and lists every configuration problem", async () => {
    await writeFile(path.join(root, CONFIG_FILE), "{ broken");
    await expect(openProject(root)).rejects.toThrow(/tradforge\.config\.json: invalid JSON/);

    await writeFile(path.join(root, CONFIG_FILE), '{ "targetLanguage": 3 }');
    await expect(openProject(root)).rejects.toThrow(/sourceLanguage[\s\S]*targetLanguage[\s\S]*sources/);
  });
});
