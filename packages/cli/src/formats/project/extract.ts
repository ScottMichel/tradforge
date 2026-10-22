import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TradforgeConfig } from "../../core/config.js";
import { groupRule } from "../../core/groups.js";
import { isBinary } from "../../core/reader.js";
import { groupOccurrences } from "../../core/segments.js";
import type { Occurrence, Segment } from "../../core/types.js";
import { decodeText } from "../../storage/encoding.js";
import { readerFor } from "../readers.js";
import { listProjectFiles } from "./project.js";

/** Reads every source of the configuration and returns the unique texts to translate, sorted by priority. */
export async function extractSegments(root: string, config: TradforgeConfig): Promise<Segment[]> {
  return groupOccurrences(await extractOccurrences(root, config));
}

/** Every text found in the project, source by source, file by file (in sorted order). */
export async function extractOccurrences(root: string, config: TradforgeConfig): Promise<Occurrence[]> {
  const occurrences: Occurrence[] = [];
  const rules = new Map(config.sources.map((source) => [source, groupRule(source.group)]));
  // The project files never include the work directory nor the translations written by a build.
  for (const { source, file } of await listProjectFiles(root, config)) {
    const bytes = await readFile(path.join(root, file));
    const input = {
      file,
      priority: source.priority,
      ...(source.context !== undefined ? { context: source.context } : {}),
    };
    const reader = readerFor(source.format);
    const found = isBinary(reader)
      ? reader.read({ ...input, bytes })
      : reader.read({ ...input, content: decodeText(bytes, source.encoding) });
    const regroup = rules.get(source) ?? ((occurrence: Occurrence) => occurrence);
    // A loop, not push(...found): spreading passes one argument per item, and huge files overflow the stack.
    for (const occurrence of found) occurrences.push(regroup(occurrence));
  }
  return occurrences;
}
