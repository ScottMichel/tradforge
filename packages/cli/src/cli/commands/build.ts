import { buildProject } from "../../formats/project/build.js";
import { loadMemory } from "../../storage/memory-store.js";
import { type Command, EXIT } from "../command.js";
import { formatCount, plural } from "../format.js";
import { projectOf } from "../project.js";

export const buildCommand: Command = {
  name: "build",
  summary: "Write the translated files",
  usage: "build [--force]",
  options: ["force"],
  maxArgs: 0,
  async run(context) {
    const { root, config, workDir } = await projectOf(context);
    const memory = await loadMemory(workDir, config);
    const report = await buildProject(root, config, memory, { force: context.options.force === true });

    const { out } = context.io;
    if (report.length === 0) {
      out('No source file found: check the "include" patterns of the configuration.');
      return EXIT.ok;
    }
    for (const file of report) {
      const total = file.translated + file.untranslated;
      out(
        `  ${file.output}: ${formatCount(file.translated)}/${formatCount(total)} translated${file.written ? "" : " (unchanged)"}`,
      );
    }
    const written = report.filter((file) => file.written).length;
    out(`${plural(written, "file")} written, ${formatCount(report.length - written)} unchanged.`);
    return EXIT.ok;
  },
};
