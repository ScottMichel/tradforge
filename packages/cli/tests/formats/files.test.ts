import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findFiles } from "../../src/formats/files.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tradforge-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function createFiles(...files: string[]): Promise<void> {
  for (const file of files) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "{}");
  }
}

describe("findFiles", () => {
  it("returns the matching files relative to the root, with / separators, sorted", async () => {
    await createFiles("locales/en/ui.json", "locales/en/items.json", "locales/en/notes.txt", "locales/fr/ui.json");
    expect(await findFiles(root, ["locales/en/*.json"])).toEqual(["locales/en/items.json", "locales/en/ui.json"]);
  });

  it("lists a file only once when several patterns match it", async () => {
    await createFiles("locales/en/ui.json");
    expect(await findFiles(root, ["locales/en/*.json", "**/ui.json"])).toEqual(["locales/en/ui.json"]);
  });

  it("ignores directories whose name matches a pattern", async () => {
    await createFiles("data.json/inner.txt", "real.json");
    expect(await findFiles(root, ["*.json"])).toEqual(["real.json"]);
  });

  it("never looks into node_modules, at any depth", async () => {
    await createFiles("node_modules/lib/en.json", "mods/node_modules/lib/en.json", "en.json");
    expect(await findFiles(root, ["**/*.json"])).toEqual(["en.json"]);
  });

  it("skips the excluded directories, such as the work directory", async () => {
    await createFiles("cache/memory.json", "cache-old/en.json", "en.json");
    expect(await findFiles(root, ["**/*.json"], { exclude: ["cache"] })).toEqual(["cache-old/en.json", "en.json"]);
  });

  it("returns an empty list when nothing matches", async () => {
    await createFiles("en.json");
    expect(await findFiles(root, ["locales/**/*.lua"])).toEqual([]);
  });
});
