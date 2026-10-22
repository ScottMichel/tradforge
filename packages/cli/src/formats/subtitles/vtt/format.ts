import type { FormatDescriptor } from "../../format.js";
import { detectSubtitles } from "../shared/detect.js";
import { vttReader } from "./reader.js";
import { vttWriter } from "./writer.js";

/** WebVTT subtitles (.vtt). */
export const vttFormat: FormatDescriptor = {
  id: "vtt",
  reader: vttReader,
  writer: vttWriter,
  extensions: [".vtt"],
  detect: (context) => detectSubtitles("vtt", context),
};
