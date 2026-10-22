import { groupOccurrences } from "../../core/segments.js";
import { extractOccurrences } from "../../formats/extract.js";
import { type Command, EXIT } from "../command.js";
import { plural } from "../format.js";
import { projectOf } from "../project.js";

export const extractCommand: Command = {
  name: "extract",
  summary: "Find the texts to translate, without translating them",
  usage: "extract [--json]",
  options: ["json"],
  maxArgs: 0,
  async run(context) {
    const { root, config } = await projectOf(context);
    const occurrences = await extractOccurrences(root, config);
    const segments = groupOccurrences(occurrences);
    if (context.options.json === true) {
      context.io.out(JSON.stringify(segments, null, 2));
      return EXIT.ok;
    }
    const files = new Set(occurrences.map((occurrence) => occurrence.location.file)).size;
    context.io.out(
      `Found ${plural(segments.length, "unique text")} (${plural(occurrences.length, "occurrence")}) in ${plural(files, "file")}.`,
    );
    return EXIT.ok;
  },
};
