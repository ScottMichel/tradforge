import { mkdir } from "node:fs/promises";
import path from "node:path";
import { extractSegments } from "../../formats/extract.js";
import { writeFileAtomic } from "../../storage/atomic.js";
import { loadMemory } from "../../storage/memory-store.js";
import { exportReviewCsv } from "../../storage/review.js";
import { EXIT, type Command } from "../command.js";
import { plural } from "../format.js";
import { displayPath, projectOf } from "../project.js";

export const exportCommand: Command = {
  name: "export",
  summary: "Write a CSV file to review or complete the translations",
  usage: "export [<file.csv>]",
  options: [],
  maxArgs: 1,
  async run(context) {
    const { root, config, workDir } = await projectOf(context);
    const [target] = context.args;
    const file = target === undefined ? path.join(workDir, "review.csv") : path.resolve(context.io.cwd, target);

    const segments = await extractSegments(root, config);
    const memory = await loadMemory(workDir, config);
    const sources = segments.map((segment) => segment.source);
    const rows = new Set([...memory.entryList().map((entry) => entry.source), ...sources]).size;

    await mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, exportReviewCsv(memory, sources));
    const shown = displayPath(context.io.cwd, file);
    context.io.out(`Exported ${plural(rows, "text")} to ${shown}.`);
    context.io.out(`Fill in or correct the "target" column, then run "tradforge import ${shown}".`);
    return EXIT.ok;
  },
};
