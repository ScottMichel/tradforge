import type { Reader } from "../../../core/reader.js";
import type { Occurrence } from "../../../core/types.js";
import { parseYaml } from "./syntax.js";

/**
 * Reads every string of a YAML file, keyed by its path ("en.menu.quit", "en.days.0"). Booleans, numbers, dates and
 * null are not texts and stay out, as in YAML 1.1: a plain "No" is a boolean for Ruby.
 */
export const yamlReader: Reader = {
  format: "yaml",
  read({ file, content, priority, context }) {
    const occurrences: Occurrence[] = [];
    for (const scalar of parseYaml(file, content).scalars) {
      if (!scalar.isText || scalar.value.trim() === "") continue;
      occurrences.push({
        source: scalar.value,
        location: { file, key: scalar.path.join("."), line: scalar.line },
        priority,
        ...(context !== undefined ? { context } : {}),
        // Texts of the same mapping or list belong together, as in JSON.
        group: `${file}#${scalar.path.slice(0, -1).join(".")}`,
      });
    }
    return occurrences;
  },
};
