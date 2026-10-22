import type { FormatDescriptor } from "../../format.js";
import { detectSubtitles } from "../shared/detect.js";
import { srtReader } from "./reader.js";
import { srtWriter } from "./writer.js";

/** SubRip subtitles (.srt). */
export const srtFormat: FormatDescriptor = {
  id: "srt",
  reader: srtReader,
  writer: srtWriter,
  extensions: [".srt"],
  detect: (context) => detectSubtitles("srt", context),
};
