import type { GroupRule } from "./config.js";
import type { Occurrence } from "./types.js";

/**
 * Builds the function that applies the grouping rule of a source to the occurrences found by its reader.
 * A factory, so that a key pattern is compiled once per source, not once per text.
 */
export function groupRule(rule: GroupRule): (occurrence: Occurrence) => Occurrence {
  if (rule === "auto") return (occurrence) => occurrence;
  if (rule === "none") return withoutGroup;
  if (rule === "file") return (occurrence) => ({ ...withoutGroup(occurrence), group: occurrence.location.file });

  // A key pattern: texts whose keys give the same first capture group (or match) belong together.
  const pattern = new RegExp(rule.keyPattern, "u");
  return (occurrence) => {
    const key = occurrence.location.key;
    const match = key === undefined ? null : pattern.exec(key);
    const rest = withoutGroup(occurrence);
    return match === null ? rest : { ...rest, group: `${occurrence.location.file}#${match[1] ?? match[0]}` };
  };
}

function withoutGroup(occurrence: Occurrence): Occurrence {
  const { group: _ignored, ...rest } = occurrence;
  return rest;
}
