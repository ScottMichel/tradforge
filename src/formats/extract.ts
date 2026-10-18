import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TradforgeConfig } from "../core/config.js";
import { groupOccurrences } from "../core/segments.js";
import type { Occurrence, Segment } from "../core/types.js";
import { listProjectFiles } from "./project.js";
import { READERS } from "./readers.js";

/** Reads every source of the configuration and returns the unique texts to translate, sorted by priority. */
export async function extractSegments(root: string, config: TradforgeConfig): Promise<Segment[]> {
  return groupOccurrences(await extractOccurrences(root, config));
}

/** Every text found in the project, source by source, file by file (in sorted order). */
export async function extractOccurrences(root: string, config: TradforgeConfig): Promise<Occurrence[]> {
  const occurrences: Occurrence[] = [];
  // The project files never include the work directory nor the translations written by a build.
  for (const { source, file } of await listProjectFiles(root, config)) {
    const content = await readFile(path.join(root, file), "utf8");
    const found = READERS[source.format].read({
      file,
      content,
      priority: source.priority,
      ...(source.context !== undefined ? { context: source.context } : {}),
    });
    // A loop, not push(...found): spreading passes one argument per item, and huge files overflow the stack.
    for (const occurrence of found) occurrences.push(occurrence);
  }
  return occurrences;
}
