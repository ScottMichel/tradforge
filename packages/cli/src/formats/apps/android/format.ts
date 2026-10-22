import path from "node:path";
import type { FormatDescriptor } from "../../format.js";
import { baseLanguage, readHead } from "../../project/detection.js";
import { androidReader } from "./reader.js";
import { androidLanguage } from "./resources.js";
import { androidWriter } from "./writer.js";

/** Android string resources (res/values/strings.xml). */
export const androidFormat: FormatDescriptor = {
  id: "android",
  reader: androidReader,
  writer: androidWriter,
  extensions: [], // .xml is too generic: Android resources are recognised by their path
  // %1$s placeholders, <xliff:g> and <b> tags
  placeholders: ["printf", "markup"],
  /**
   * <...>/res/values/strings.xml (or values-en/), whose root is <resources> and which hold texts. One source per
   * file: other files of the folder (colors, dimensions) must not be copied into values-fr/.
   */
  async detect(context) {
    const { file, sourceLanguage, targetLanguage } = context;
    const parts = path.posix.dirname(file).split("/");
    const folder = parts.at(-1) ?? "";
    if (!file.toLowerCase().endsWith(".xml") || parts.at(-2) !== "res" || !folder.startsWith("values")) {
      return undefined;
    }
    const content = await readHead(context, Number.POSITIVE_INFINITY);
    if (!/<resources[\s>]/.test(content) || !/<(?:string|string-array|plurals)[\s>]/.test(content)) return undefined;
    const source = androidLanguage(sourceLanguage);
    if (folder !== "values" && folder !== `values-${source}` && folder !== `values-${baseLanguage(sourceLanguage)}`) {
      return { reason: "Android strings of another language or configuration" };
    }
    const target = targetLanguage === undefined ? "{lang}" : androidLanguage(targetLanguage);
    const output = [...parts.slice(0, -1), `values-${target}`].join("/");
    return { format: "android", include: file, output: `${output}/{name}{ext}` };
  },
};
