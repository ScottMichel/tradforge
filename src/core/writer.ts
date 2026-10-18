import type { OutputConfig, SourceFormat } from "./config.js";

export interface WriterInput {
  /** Source file path, relative to the project root (for error messages). */
  readonly file: string;
  /** Content of the source file: the writer follows its structure. */
  readonly content: string;
  /** The translation of a source text, or undefined if there is none yet. */
  readonly translate: (source: string) => string | undefined;
  readonly options: Pick<OutputConfig, "asciiOnly" | "untranslated">;
}

export interface WriterOutput {
  readonly content: string;
  /** Texts replaced by their translation. */
  readonly translated: number;
  /** Texts without translation (kept or left out, depending on the options). */
  readonly untranslated: number;
}

/** Port: writes the translated version of a source file. Pure, like the readers: no disk access. */
export interface Writer {
  readonly format: SourceFormat;
  readonly write: (input: WriterInput) => WriterOutput;
}
