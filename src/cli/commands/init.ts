import path from "node:path";
import { detectSources } from "../../formats/detect.js";
import { writeFileAtomic } from "../../storage/atomic.js";
import { readFileIfExists } from "../../storage/read.js";
import { type Command, EXIT } from "../command.js";
import { CONFIG_FILE, renderConfig } from "../config-file.js";
import { formatCount, plural } from "../format.js";
import { CliError, displayPath } from "../project.js";

/** Left-out files listed after init: enough to understand, not a wall of text. */
const MAX_SKIPPED_SHOWN = 10;

export const initCommand: Command = {
  name: "init",
  summary: "Create a commented tradforge.config.json, with the text files found in the folder",
  usage: "init [--from <lang>] [--to <lang>] [--force]",
  options: ["force", "from", "to"],
  maxArgs: 0,
  async run({ io, options }) {
    const file = path.resolve(io.cwd, options.config ?? CONFIG_FILE);
    if (options.force !== true && (await readFileIfExists(file)) !== undefined) {
      throw new CliError(`${displayPath(io.cwd, file)} already exists. Use --force to replace it.`);
    }
    const sourceLanguage = options.from ?? "en";
    const targetLanguage = options.to ?? "fr";
    const { sources, skipped } = await detectSources(path.dirname(file), sourceLanguage, targetLanguage);
    await writeFileAtomic(file, renderConfig({ sourceLanguage, targetLanguage, sources }));

    const shown = displayPath(io.cwd, file);
    if (sources.length === 0) {
      io.out(`Created ${shown}. No text file was found: describe your files in its "sources" section.`);
    } else {
      io.out(`Created ${shown} with ${plural(sources.length, "source")} found in the folder:`);
      for (const source of sources) {
        io.out(`  ${source.format}  ${source.include.join(", ")} (${plural(source.files, "file")}) → ${source.output}`);
      }
    }
    if (skipped.length > 0) {
      io.out(`Left out ${plural(skipped.length, "file")} (add them to "sources" if they hold texts):`);
      for (const { file: left, reason } of skipped.slice(0, MAX_SKIPPED_SHOWN)) io.out(`  ${left}: ${reason}`);
      if (skipped.length > MAX_SKIPPED_SHOWN)
        io.out(`  ... and ${formatCount(skipped.length - MAX_SKIPPED_SHOWN)} more`);
    }
    io.out('Check the file, then run "tradforge status".');
    return EXIT.ok;
  },
};
