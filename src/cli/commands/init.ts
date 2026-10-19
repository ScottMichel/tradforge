import path from "node:path";
import { writeFileAtomic } from "../../storage/atomic.js";
import { readFileIfExists } from "../../storage/read.js";
import { EXIT, type Command } from "../command.js";
import { CONFIG_FILE, CONFIG_TEMPLATE } from "../config-file.js";
import { CliError, displayPath } from "../project.js";

export const initCommand: Command = {
  name: "init",
  summary: "Create a commented tradforge.config.json in the current folder",
  usage: "init [--force]",
  options: ["force"],
  maxArgs: 0,
  async run({ io, options }) {
    const file = path.resolve(io.cwd, options.config ?? CONFIG_FILE);
    if (options.force !== true && (await readFileIfExists(file)) !== undefined) {
      throw new CliError(`${displayPath(io.cwd, file)} already exists. Use --force to replace it.`);
    }
    await writeFileAtomic(file, CONFIG_TEMPLATE);
    io.out(`Created ${displayPath(io.cwd, file)}. Describe your project in it, then run "tradforge status".`);
    return EXIT.ok;
  },
};
