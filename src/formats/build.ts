import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import type { TradforgeConfig } from "../core/config.js";
import type { TranslationMemory } from "../core/memory.js";
import type { WriterOutput } from "../core/writer.js";
import { writeFileAtomic } from "../storage/atomic.js";
import { readFileIfExists } from "../storage/read.js";
import { listProjectFiles, OutputError } from "./project.js";
import { WRITERS } from "./writers.js";

export interface BuildOptions {
  /** Replace outputs even when the new version is much smaller. */
  readonly force?: boolean;
}

export interface BuiltFile {
  readonly source: string;
  readonly output: string;
  readonly translated: number;
  readonly untranslated: number;
  /** False when the output was already up to date. */
  readonly written: boolean;
}

/** Outputs smaller than this are never guarded: small files legitimately change a lot. */
const MIN_GUARDED_BYTES = 1024;
/** A new output under half the size of the existing one looks like a mistake. */
const MIN_SIZE_RATIO = 0.5;

interface PlannedFile {
  readonly file: string;
  readonly output: string;
  readonly result: WriterOutput;
  readonly existing: string | undefined;
}

/**
 * Writes the translated version of every source file.
 * Everything is planned in memory first: if any output fails a check, nothing at all is written.
 */
export async function buildProject(
  root: string,
  config: TradforgeConfig,
  memory: TranslationMemory,
  options: BuildOptions = {},
): Promise<BuiltFile[]> {
  const translate = (source: string) => memory.get(source)?.target;

  const plans: PlannedFile[] = [];
  for (const { source, file, output } of await listProjectFiles(root, config)) {
    const content = await readFile(path.join(root, file), "utf8");
    const result = WRITERS[source.format].write({ file, content, translate, options: source.output });
    plans.push({ file, output, result, existing: await readFileIfExists(path.join(root, output)) });
  }
  plans.sort((a, b) => compareCodeUnits(a.output, b.output));

  if (options.force !== true) checkSizes(plans);

  const report: BuiltFile[] = [];
  for (const { file, output, result, existing } of plans) {
    const written = existing !== result.content; // an identical file is left untouched
    if (written) {
      const target = path.join(root, output);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, result.content);
    }
    report.push({ source: file, output, translated: result.translated, untranslated: result.untranslated, written });
  }
  return report;
}

/** The guard born from a real accident: a 98,000-entry file replaced by a 20-entry one. */
function checkSizes(plans: readonly PlannedFile[]): void {
  const shrunk = plans.flatMap(({ output, result, existing }) => {
    if (existing === undefined) return [];
    const before = Buffer.byteLength(existing);
    const after = Buffer.byteLength(result.content);
    return before >= MIN_GUARDED_BYTES && after < before * MIN_SIZE_RATIO ? [`  - ${output}: ${before} → ${after} bytes`] : [];
  });
  if (shrunk.length > 0) {
    throw new OutputError(
      `these outputs would become much smaller than they are now, nothing was written:\n${shrunk.join("\n")}\n` +
        "Check the configuration and the folder you run from, or use --force to replace them anyway.",
    );
  }
}
