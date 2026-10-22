import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import type { TradforgeConfig } from "../core/config.js";
import type { TranslationMemory } from "../core/memory.js";
import { isBinary } from "../core/reader.js";
import type { WriterOutput } from "../core/writer.js";
import { writeFileAtomic } from "../storage/atomic.js";
import { decodeText, EncodingError, encodeText } from "../storage/encoding.js";
import { readBytesIfExists } from "../storage/read.js";
import { listProjectFiles, OutputError } from "./project.js";
import { writerFor } from "./writers.js";

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
  readonly result: Pick<WriterOutput, "translated" | "untranslated">;
  /** The translated file, encoded as configured. */
  readonly bytes: Uint8Array;
  readonly existing: Uint8Array | undefined;
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
  const unencodable: string[] = [];
  for (const { source, file, output } of await listProjectFiles(root, config)) {
    const sourceBytes = await readFile(path.join(root, file));
    const languages = { source: config.sourceLanguage, target: config.targetLanguage };
    const input = { file, translate, options: source.output, languages };
    const writer = writerFor(source.format);
    let result: { readonly translated: number; readonly untranslated: number };
    let bytes: Uint8Array;
    try {
      if (isBinary(writer)) {
        const written = writer.write({ ...input, bytes: sourceBytes });
        result = written;
        bytes = written.bytes; // a binary file has no text encoding
      } else {
        const written = writer.write({ ...input, content: decodeText(sourceBytes, source.encoding) });
        result = written;
        bytes = encodeText(written.content, source.output.encoding);
      }
    } catch (error) {
      if (!(error instanceof EncodingError)) throw error;
      unencodable.push(`  - ${output}: ${error.message}`);
      continue;
    }
    plans.push({ file, output, result, bytes, existing: await readBytesIfExists(path.join(root, output)) });
  }
  if (unencodable.length > 0) {
    throw new OutputError(
      `some translations cannot be written in the chosen encoding, nothing was written:\n${unencodable.join("\n")}\n` +
        'Choose another "output.encoding" (such as "utf-8"), or correct these translations.',
    );
  }
  plans.sort((a, b) => compareCodeUnits(a.output, b.output));

  if (options.force !== true) checkSizes(plans);

  const report: BuiltFile[] = [];
  for (const { file, output, result, bytes, existing } of plans) {
    const written = existing === undefined || !Buffer.from(existing).equals(bytes); // identical files stay untouched
    if (written) {
      const target = path.join(root, output);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, bytes);
    }
    report.push({ source: file, output, translated: result.translated, untranslated: result.untranslated, written });
  }
  return report;
}

/** The guard born from a real accident: a 98,000-entry file replaced by a 20-entry one. */
function checkSizes(plans: readonly PlannedFile[]): void {
  const shrunk = plans.flatMap(({ output, bytes, existing }) => {
    if (existing === undefined) return [];
    const before = existing.length;
    const after = bytes.length;
    return before >= MIN_GUARDED_BYTES && after < before * MIN_SIZE_RATIO
      ? [`  - ${output}: ${before} → ${after} bytes`]
      : [];
  });
  if (shrunk.length > 0) {
    throw new OutputError(
      `these outputs would become much smaller than they are now, nothing was written:\n${shrunk.join("\n")}\n` +
        "Check the configuration and the folder you run from, or use --force to replace them anyway.",
    );
  }
}
