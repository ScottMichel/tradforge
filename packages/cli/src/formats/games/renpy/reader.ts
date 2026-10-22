import { ReadError, type Reader, stripBom } from "../../../core/reader.js";
import { RenpySyntaxError } from "./lexer.js";
import { extractRenpyTexts, type RenpyText } from "./script.js";

/**
 * Reads the texts a player sees in a Ren'Py script (.rpy): dialogue, narration, menu choices and strings marked with
 * _(). Keys are "label:rank" ("start:3"), so that they survive lines moving; texts of one label form a group.
 */
export const renpyReader: Reader = {
  format: "renpy",
  read({ file, content, priority, context }) {
    return parseRenpy(file, content).map((text) => ({
      source: text.value,
      location: { file, key: `${text.scope}:${text.index}`, line: text.line },
      priority,
      ...(context !== undefined ? { context } : {}),
      ...(text.grouped ? { group: `${file}#${text.scope}` } : {}),
    }));
  },
};

/** Every text of a Ren'Py script; syntax errors name the file. */
export function parseRenpy(file: string, content: string): RenpyText[] {
  try {
    return extractRenpyTexts(stripBom(content));
  } catch (error) {
    if (error instanceof RenpySyntaxError) {
      throw new ReadError(file, `invalid Ren'Py (${error.message})`, { cause: error });
    }
    throw error;
  }
}
