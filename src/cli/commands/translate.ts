import { type ProgressEvent, selectSegments, translateSegments } from "../../core/pipeline.js";
import type { Segment } from "../../core/types.js";
import { extractSegments } from "../../formats/extract.js";
import { createProvider } from "../../providers/factory.js";
import { loadMemory, memoryFilePath, saveMemory } from "../../storage/memory-store.js";
import { type Command, EXIT, UsageError } from "../command.js";
import { formatCount, formatDuration, plural, quote } from "../format.js";
import { displayPath, projectOf } from "../project.js";

/** Texts listed by a dry run: enough to check the selection. */
const DRY_RUN_PREVIEW = 10;

export const translateCommand: Command = {
  name: "translate",
  summary: "Translate the texts that the memory does not have yet",
  usage: "translate [--limit <n>] [--only <path>] [--retry] [--dry-run]",
  options: ["limit", "only", "retry", "dry-run"],
  maxArgs: 0,
  async run(context) {
    const { io, options } = context;
    const limit = parseLimit(options.limit); // usage errors first, before touching any file
    const { root, config, workDir } = await projectOf(context);
    const all = await extractSegments(root, config);
    const segments = options.only === undefined ? all : onlyIn(all, options.only);
    const memory = await loadMemory(workDir, config);
    const retryFailed = options.retry === true;
    const { todo, alreadyDone } = selectSegments(segments, memory, {
      retryFailed,
      ...(limit !== undefined ? { limit } : {}),
    });
    const chars = todo.reduce((sum, segment) => sum + segment.source.length, 0);

    if (options["dry-run"] === true) {
      const batches = Math.ceil(todo.length / config.translation.batchSize);
      io.out(
        `Would translate ${plural(todo.length, "text")} (${formatCount(chars)} characters) ` +
          `in ${plural(batches, "batch", "batches")} with ${config.provider.model}.`,
      );
      for (const segment of todo.slice(0, DRY_RUN_PREVIEW)) io.out(`  ${quote(segment.source)}`);
      if (todo.length > DRY_RUN_PREVIEW) io.out(`  ... and ${formatCount(todo.length - DRY_RUN_PREVIEW)} more`);
      return EXIT.ok;
    }

    if (todo.length === 0) {
      io.out(`Nothing to translate: ${plural(alreadyDone, "text")} already in the memory.`);
      if (!retryFailed && memory.failureList().length > 0) io.out(FAILURE_HINT);
      return EXIT.ok;
    }

    const provider = (io.createProvider ?? createProvider)(config.provider);
    io.out(
      `Translating ${plural(todo.length, "text")} (${formatCount(chars)} characters) with ${provider.model}, ` +
        `${config.translation.batchSize} per batch...`,
    );
    const summary = await translateSegments({
      segments,
      memory,
      provider,
      config,
      save: () => saveMemory(workDir, memory),
      onProgress: (event) => io.out(progressLine(event)),
      onRateLimit: (event) => io.out(`  Rate limit reached: waiting ${formatDuration(event.waitMs)}...`),
      retryFailed,
      ...(limit !== undefined ? { limit } : {}),
      ...(io.signal !== undefined ? { signal: io.signal } : {}),
    });

    if (summary.interrupted) {
      io.out(
        `Interrupted: ${formatCount(summary.translated)} translated, progress saved. Run the same command to resume.`,
      );
      return EXIT.interrupted;
    }
    io.out(
      `Done: ${formatCount(summary.translated)} translated` +
        (summary.reused > 0 ? ` (${formatCount(summary.reused)} reused from slightly changed texts)` : "") +
        `, ${formatCount(summary.failed)} failed. ` +
        `Memory saved in ${displayPath(io.cwd, memoryFilePath(workDir))}.`,
    );
    if (summary.failed > 0) io.out(FAILURE_HINT);
    return EXIT.ok;
  },
};

const FAILURE_HINT =
  'Run "tradforge export" to review the failures, or "tradforge translate --retry" to try them again.';

function progressLine(event: ProgressEvent): string {
  const left =
    event.remainingMs !== undefined && event.done < event.total
      ? `, about ${formatDuration(event.remainingMs)} left`
      : "";
  return `  ${formatCount(event.done)}/${formatCount(event.total)} done, ${formatCount(event.failed)} failed${left}`;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(value)) throw new UsageError("--limit must be a positive integer");
  return Number(value);
}

/** Segments found in this file, or in the files of this folder. */
function onlyIn(segments: readonly Segment[], only: string): Segment[] {
  const target = only.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  return segments.filter((segment) =>
    segment.locations.some((location) => location.file === target || location.file.startsWith(`${target}/`)),
  );
}
