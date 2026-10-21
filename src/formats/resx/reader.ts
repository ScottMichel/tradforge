import type { Reader } from "../../core/reader.js";
import type { Occurrence } from "../../core/types.js";
import { parseResx } from "./resources.js";

/** Reads every string of a .resx file; its comment goes to the translator as context. */
export const resxReader: Reader = {
  format: "resx",
  read({ file, content, priority, context }) {
    return parseResx(file, content).map((resource): Occurrence => {
      const hints = [context, resource.comment].filter((hint) => hint !== undefined && hint !== "");
      return {
        source: resource.value,
        location: { file, key: resource.name, line: resource.element.line },
        priority,
        ...(hints.length > 0 ? { context: hints.join(" | ") } : {}),
      };
    });
  },
};
