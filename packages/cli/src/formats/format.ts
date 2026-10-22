import type { SourceFormat } from "../core/config.js";
import type { BinaryReader, Reader } from "../core/reader.js";
import type { PlaceholderSyntax } from "../core/validation/placeholders.js";
import type { BinaryWriter, Writer } from "../core/writer.js";
import type { DetectionContext, DetectionResult } from "./project/detection.js";

/**
 * Everything tradforge knows about one format, in one place: how to read it, how to write it, how to recognise its
 * files, and what it brings to the validation. Each format folder exports one (format.ts); the registry gathers them.
 */
export interface FormatDescriptor {
  readonly id: SourceFormat;
  readonly reader: Reader | BinaryReader;
  readonly writer: Writer | BinaryWriter;
  /** File extensions, in lower case. Empty when the extension is too generic (.xml, .txt): detect looks at the path. */
  readonly extensions: readonly string[];
  /** Placeholder syntaxes the format brings, on top of the configured ones ([Root.GetName] in Paradox games). */
  readonly placeholders?: readonly PlaceholderSyntax[];
  /** The format holds every language (Xcode string catalogs): the translation is written into the source file. */
  readonly multilingual?: boolean;
  /**
   * Recognises a file of the format for tradforge init: a suggested source, a reason to leave the file out, or
   * undefined when the file is not of this format (another format may then take it).
   */
  readonly detect: (context: DetectionContext) => DetectionResult | Promise<DetectionResult>;
}
