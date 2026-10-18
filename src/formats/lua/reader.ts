import { ReadError, stripBom, type Reader } from "../../core/reader.js";
import { isNaturalText } from "./natural-text.js";
import { extractLuaStrings, LuaSyntaxError, type LuaString } from "./strings.js";

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

function lexLua(file: string, content: string): LuaString[] {
  try {
    return extractLuaStrings(stripBom(content));
  } catch (error) {
    if (error instanceof LuaSyntaxError) {
      throw new ReadError(file, `invalid Lua (${error.message})`, { cause: error });
    }
    throw error;
  }
}
