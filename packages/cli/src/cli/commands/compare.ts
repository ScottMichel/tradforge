import { mkdir } from "node:fs/promises";
import path from "node:path";
import { benchmarkEngines, type EngineResult } from "../../core/benchmark.js";
import { effectivePlaceholders } from "../../core/config.js";
import { planRequests } from "../../core/pipeline.js";
import { sampleSegments } from "../../core/sample.js";
import { extractSegments } from "../../formats/extract.js";
import { createProvider } from "../../providers/factory.js";
import { estimateUsage } from "../../providers/usage.js";
import { writeFileAtomic } from "../../storage/atomic.js";
import { formatCsv } from "../../storage/csv.js";
import { loadMemory } from "../../storage/memory-store.js";
import { type Command, EXIT, UsageError } from "../command.js";
import { type EngineSpec, parseEngines } from "../engines.js";
import { formatCount, formatDuration, plural, quote } from "../format.js";
import { displayPath, projectOf } from "../project.js";
import { costLabel } from "../usage.js";

const DEFAULT_SAMPLE = 30;

/** Texts shown side by side in the terminal; the CSV file has them all. */
const SIDE_BY_SIDE = 5;

export const compareCommand: Command = {
  name: "compare",
  summary: "Translate a sample with several engines, to choose one",
  usage: "compare --engines <type[:model],...> [--sample <n>] [<file.csv>]",
  options: ["engines", "sample"],
  maxArgs: 1,
  async run(context) {
    const { io, options } = context;
    const size = parseSample(options.sample);
    if (options.engines === undefined) {
      throw new UsageError('compare needs --engines, e.g. --engines "ollama,gemini:gemini-flash-latest,deepl"');
    }
    const { root, config, workDir } = await projectOf(context);
    const specs = parseEngines(options.engines, config.provider);
    const segments = await extractSegments(root, config);
    const sample = sampleSegments(segments, size, effectivePlaceholders(config));
    if (sample.length === 0) {
      io.out("No text found: check the sources of the configuration.");
      return EXIT.ok;
    }

    const chars = sample.reduce((sum, segment) => sum + segment.source.length, 0);
    io.out(
      `Comparing ${plural(specs.length, "engine")} on ${plural(sample.length, "text")} ` +
        `(${formatCount(chars)} characters). The project memory is not changed.`,
    );
    const make = io.createProvider ?? createProvider;
    const results = await benchmarkEngines({
      segments: sample,
      config,
      engines: specs.map((spec) => ({ label: spec.label, provider: make(spec.config) })),
      ...(io.signal !== undefined ? { signal: io.signal } : {}),
      onEngineDone: (result) => io.out(`  ${result.label}: ${progress(result, sample.length)}`),
      onRateLimit: (label, event) =>
        io.out(`  ${label}: rate limit reached, waiting ${formatDuration(event.waitMs)}...`),
    });

    // What translating the rest of the project would cost with each engine, from its real requests.
    const memory = await loadMemory(workDir, config);
    const plan = planRequests(segments, memory, config);
    io.out("");
    for (const line of table(results, specs, sample.length, (spec) =>
      costLabel(spec.config, estimateUsage(spec.config, plan)),
    )) {
      io.out(line);
    }
    for (const result of results) {
      if (result.error !== undefined) io.out(`${result.label} could not be used: ${result.error}`);
    }

    io.out("");
    for (const segment of sideBySide(
      sample.map((s) => s.source),
      results,
    )) {
      io.out(quote(segment));
      for (const result of results) {
        // One line per engine: line breaks are shown as \n, as in the quoted source above.
        const shown = cell(result, segment).replaceAll("\r", "\\r").replaceAll("\n", "\\n");
        io.out(`  ${result.label.padEnd(labelWidth(results))}  ${shown}`);
      }
    }

    const file =
      context.args[0] === undefined ? path.join(workDir, "compare.csv") : path.resolve(io.cwd, context.args[0]);
    const rows = [
      ["source", ...results.map((result) => result.label)],
      ...sample.map((segment) => [segment.source, ...results.map((result) => cell(result, segment.source))]),
    ];
    await mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, formatCsv(rows));
    io.out("");
    io.out(`Every translation side by side: ${displayPath(io.cwd, file)}`);
    return io.signal?.aborted === true ? EXIT.interrupted : EXIT.ok;
  },
};

function parseSample(value: string | undefined): number {
  if (value === undefined) return DEFAULT_SAMPLE;
  if (!/^[1-9]\d*$/.test(value)) throw new UsageError("--sample must be a positive integer");
  return Number(value);
}

function progress(result: EngineResult, total: number): string {
  if (result.error !== undefined) return "could not be used";
  return `${result.translated}/${total} translated, ${result.failed} failed, ${formatDuration(result.elapsedMs)}`;
}

function table(
  results: readonly EngineResult[],
  specs: readonly EngineSpec[],
  total: number,
  projectCost: (spec: EngineSpec) => string,
): string[] {
  const rows = [
    ["Engine", "Translated", "Failed", "Time", "Rest of the project"],
    ...results.map((result) => {
      const spec = specs.find((s) => s.label === result.label);
      return [
        result.label,
        result.error !== undefined ? "-" : `${result.translated}/${total}`,
        result.error !== undefined ? "-" : String(result.failed),
        formatDuration(result.elapsedMs),
        spec === undefined ? "" : projectCost(spec),
      ];
    }),
  ];
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
  return rows.map((row) =>
    row
      .map((value, column) => value.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd(),
  );
}

function labelWidth(results: readonly EngineResult[]): number {
  return Math.max(...results.map((result) => result.label.length));
}

function cell(result: EngineResult, source: string): string {
  const target = result.targets.get(source);
  if (target !== undefined) return target;
  const failure = result.failures.get(source);
  return failure !== undefined ? `FAILED: ${failure}` : "-";
}

/** Texts on which the engines disagree come first: they are the ones worth reading. */
function sideBySide(sources: readonly string[], results: readonly EngineResult[]): string[] {
  const differ = (source: string) => new Set(results.map((result) => cell(result, source))).size > 1;
  return [...sources.filter(differ), ...sources.filter((source) => !differ(source))].slice(0, SIDE_BY_SIDE);
}
