import { ReadError, type Reader, stripBom } from "../../core/reader.js";
import { isNaturalText } from "./natural-text.js";
import { extractLuaStrings, type LuaString, LuaSyntaxError } from "./strings.js";

export const luaReader: Reader = {
  format: "lua",
  read({ file, content, priority, context }) {
    return lexLua(file, content)
      .filter((literal) => isNaturalText(literal.value))
      .map((literal) => ({
        source: literal.value,
        location: { file, line: literal.line },
        priority,
        ...(context !== undefined ? { context } : {}),
      }));
  },
};

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
