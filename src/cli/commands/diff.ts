import { diffSources } from "../../core/diff.js";
import { extractSegments } from "../../formats/extract.js";
import { loadMemory } from "../../storage/memory-store.js";
import { EXIT, type Command } from "../command.js";
import { formatCount, quote } from "../format.js";
import { projectOf } from "../project.js";

/** Long lists are cut: the counts tell the full story. */
const MAX_LINES = 20;

export const diffCommand: Command = {
  name: "diff",
  summary: "Compare the texts of the project with the translation memory",
  usage: "diff",
  options: [],
  maxArgs: 0,
  async run(context) {
    const { root, config, workDir } = await projectOf(context);
    const segments = await extractSegments(root, config);
    const memory = await loadMemory(workDir, config);
    const diff = diffSources(
      segments.map((segment) => segment.source),
      memory.entryList().map((entry) => entry.source),
    );

    const { out } = context.io;
    out(
      `Compared with the memory: ${formatCount(diff.added.length)} new, ` +
        `${formatCount(diff.removed.length)} removed, ${formatCount(diff.changed.length)} changed.`,
    );
    printList(
      out,
      "Changed (the old translation is a good starting point):",
      diff.changed.map((c) => `${quote(c.from)} → ${quote(c.to)} (${Math.round(c.similarity * 100)} %)`),
    );
    printList(out, "New:", diff.added.map(quote));
    printList(out, "Removed (kept in the memory):", diff.removed.map(quote));
    return EXIT.ok;
  },
};

function printList(out: (line: string) => void, title: string, lines: readonly string[]): void {
  if (lines.length === 0) return;
  out("");
  out(title);
  for (const line of lines.slice(0, MAX_LINES)) out(`  ${line}`);
  if (lines.length > MAX_LINES) out(`  ... and ${formatCount(lines.length - MAX_LINES)} more`);
}
