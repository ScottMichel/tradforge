import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../../src/storage/atomic.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "tradforge-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("writes a new file", async () => {
    const file = path.join(dir, "memory.json");
    await writeFileAtomic(file, "Café\n");
    expect(await readFile(file, "utf8")).toBe("Café\n");
  });

  it("replaces an existing file and leaves no temporary file behind", async () => {
    const file = path.join(dir, "memory.json");
    await writeFile(file, "old");
    await writeFileAtomic(file, "new");
    expect(await readFile(file, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["memory.json"]);
  });

  it("cleans up and rethrows when the file cannot be replaced", async () => {
    const target = path.join(dir, "taken");
    await mkdir(target); // a directory cannot be replaced by a file
    await expect(writeFileAtomic(target, "data")).rejects.toThrow();
    expect(await readdir(dir)).toEqual(["taken"]);
  });
});
