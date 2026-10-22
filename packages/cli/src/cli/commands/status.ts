import { extractSegments } from "../../formats/extract.js";
import { loadMemory } from "../../storage/memory-store.js";
import { type Command, EXIT } from "../command.js";
import { formatCount } from "../format.js";
import { projectOf } from "../project.js";

export const statusCommand: Command = {
  name: "status",
  summary: "Show how much of the project is translated",
  usage: "status",
  options: [],
  maxArgs: 0,
  async run(context) {
    const { root, config, workDir } = await projectOf(context);
    const segments = await extractSegments(root, config);
    const memory = await loadMemory(workDir, config);
    const stats = memory.stats(segments.map((segment) => segment.source));
    const percent = stats.total === 0 ? 0 : (stats.translated * 100) / stats.total;

    const { out } = context.io;
    out(`Project: ${root}`);
    out(`Languages: ${config.sourceLanguage} → ${config.targetLanguage}, model ${config.provider.model}`);
    out(`Texts: ${formatCount(stats.total)}`);
    out(
      `  translated    ${formatCount(stats.translated)} (${percent.toFixed(1)} %), ${formatCount(stats.reviewed)} reviewed`,
    );
    out(`  failed        ${formatCount(stats.failed)}`);
    out(`  to translate  ${formatCount(stats.pending)}`);
    out(`  stale         ${formatCount(stats.stale)} (translations whose text left the project)`);
    return EXIT.ok;
  },
};
