import path from "node:path";
import { loadMemory, saveMemory } from "../../storage/memory-store.js";
import { readFileIfExists } from "../../storage/read.js";
import { importReviewCsv } from "../../storage/review.js";
import { EXIT, UsageError, type Command } from "../command.js";
import { formatCount } from "../format.js";
import { CliError, displayPath, projectOf } from "../project.js";

export const importCommand: Command = {
  name: "import",
  summary: "Import reviewed or manual translations from a CSV file",
  usage: "import <file.csv> [--keep]",
  options: ["keep"],
  maxArgs: 1,
  async run(context) {
    const [target] = context.args;
    if (target === undefined) throw new UsageError("missing the CSV file: tradforge import <file.csv>");
    const { config, workDir } = await projectOf(context);

    const file = path.resolve(context.io.cwd, target);
    const csv = await readFileIfExists(file);
    if (csv === undefined) throw new CliError(`${displayPath(context.io.cwd, file)} does not exist`);

    const memory = await loadMemory(workDir, config);
    const result = importReviewCsv(memory, csv, { keep: context.options.keep === true });
    await saveMemory(workDir, memory);
    context.io.out(
      `Imported ${displayPath(context.io.cwd, file)}: ${formatCount(result.added)} added, ` +
        `${formatCount(result.updated)} updated, ${formatCount(result.skipped)} skipped, ` +
        `${formatCount(result.unchanged)} unchanged, ${formatCount(result.empty)} empty.`,
    );
    return EXIT.ok;
  },
};
