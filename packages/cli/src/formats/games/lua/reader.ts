import { ReadError, type Reader, stripBom } from "../../../core/reader.js";
import { isNaturalText } from "./natural-text.js";
import { extractLuaStrings, type LuaString, LuaSyntaxError } from "./strings.js";

export const luaReader: Reader = {
  format: "lua",
  read({ file, content, priority, context }) {
    const lines = stripBom(content).split(/\r\n|\r|\n/);
    const texts = lexLua(file, content).filter((literal) => isNaturalText(literal.value));
    let blockStart = 0;
    return texts.map((literal, index) => {
      const previous = texts[index - 1];
      if (previous === undefined || hasBlankLineBetween(lines, previous.line, literal.line)) blockStart = literal.line;
      return {
        source: literal.value,
        location: { file, line: literal.line },
        priority,
        ...(context !== undefined ? { context } : {}),
        // Like paragraphs: texts that no blank line separates belong together (the lines of a dialogue).
        group: `${file}#${blockStart}`,
      };
    });
  },
};

/** True if one of the lines strictly between two 1-based line numbers is empty or only spaces. */
function hasBlankLineBetween(lines: readonly string[], first: number, last: number): boolean {
  for (let line = first + 1; line < last; line++) {
    if ((lines[line - 1] ?? "").trim() === "") return true;
  }
  return false;
}

/** Every string literal of a Lua source file; syntax errors name the file. */
export function lexLua(file: string, content: string): LuaString[] {
  try {
    return extractLuaStrings(stripBom(content));
  } catch (error) {
    if (error instanceof LuaSyntaxError) {
      throw new ReadError(file, `invalid Lua (${error.message})`, { cause: error });
    }
    throw error;
  }
}
