import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig, type TradforgeConfig } from "../src/core/config.js";
import { translateSegments } from "../src/core/pipeline.js";
import { extractSegments } from "../src/formats/project/extract.js";
import { createMockProvider } from "../src/providers/mock/provider.js";
import { loadMemory, saveMemory } from "../src/storage/memory-store.js";

let root: string;
let config: TradforgeConfig;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tradforge-"));
  await mkdir(path.join(root, "locales", "en"), { recursive: true });
  await writeFile(
    path.join(root, "locales", "en", "ui.json"),
    JSON.stringify({ title: "Welcome", menu: { play: "Play", quit: "Quit", hello: "Hello {name}" } }),
  );
  config = parseConfig({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sources: [{ format: "json", include: ["locales/en/*.json"] }],
    translation: { batchSize: 2 },
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** One run of the tool, as the CLI will do it: extract, load the memory, translate, save after each batch. */
async function runOnce(limit?: number) {
  const workDir = path.join(root, config.workDir);
  const segments = await extractSegments(root, config);
  const memory = await loadMemory(workDir, config);
  const provider = createMockProvider();
  const summary = await translateSegments({
    segments,
    memory,
    provider,
    config,
    save: () => saveMemory(workDir, memory),
    ...(limit !== undefined ? { limit } : {}),
  });
  return { summary, provider };
}

describe("end to end", () => {
  it("resumes an interrupted translation without redoing anything", async () => {
    const first = await runOnce(3);
    expect(first.summary).toMatchObject({ total: 3, alreadyDone: 0, translated: 3 });

    const second = await runOnce();
    expect(second.summary).toMatchObject({ total: 1, alreadyDone: 3, translated: 1 });
    expect(second.provider.requests.flatMap((request) => request.items.map((item) => item.source))).toEqual([
      "Hello {name}",
    ]);

    const third = await runOnce();
    expect(third.summary).toMatchObject({ total: 0, alreadyDone: 4 });
    expect(third.provider.requests).toEqual([]);

    const memory = await loadMemory(path.join(root, config.workDir), config);
    expect(memory.get("Hello {name}")?.target).toBe("[fr] Hello {name}");
  });
});
