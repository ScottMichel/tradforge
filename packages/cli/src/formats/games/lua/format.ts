import type { FormatDescriptor } from "../../format.js";
import { luaReader } from "./reader.js";
import { luaWriter } from "./writer.js";

/** Lua scripts (.lua). */
export const luaFormat: FormatDescriptor = {
  id: "lua",
  reader: luaReader,
  writer: luaWriter,
  extensions: [".lua"],
  /**
   * Every Lua file is kept, as one source with a pattern per folder: the reader only takes texts meant for people.
   * The translations go to a separate folder: a game must not load the original and the translated script side by
   * side.
   */
  detect({ file }) {
    return { format: "lua", include: file, output: "translations/{lang}/{dir}/{name}{ext}", byFolder: true };
  },
};
