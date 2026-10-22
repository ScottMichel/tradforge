import type { FormatDescriptor } from "../../format.js";
import { renpyReader } from "./reader.js";
import { renpyWriter } from "./writer.js";

/** Ren'Py scripts (.rpy). */
export const renpyFormat: FormatDescriptor = {
  id: "renpy",
  reader: renpyReader,
  writer: renpyWriter,
  extensions: [".rpy"],
  // text tags {b} and interpolations [name], and the printf placeholders of Python
  placeholders: ["renpy", "printf"],
  /**
   * Every script of the game, as one source with a pattern per folder, translated to a separate folder. game/tl/
   * holds existing translations and renpy/ the engine shipped with some games: neither is the game's text.
   */
  detect({ file }) {
    if (/(^|\/)(game\/tl|renpy)\//.test(file)) return undefined;
    return { format: "renpy", include: file, output: "translations/{lang}/{dir}/{name}{ext}", byFolder: true };
  },
};
