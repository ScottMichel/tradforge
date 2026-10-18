import type { SourceFormat } from "./config.js";
import type { Occurrence } from "./types.js";

/** What a reader receives: the content is already loaded, so reading stays pure. */
export interface ReaderInput {
  /** Path relative to the project root, with "/" separators. */
  readonly file: string;
  readonly content: string;
  readonly priority: number;
  readonly context?: string;
}

/** Port: extracts the texts to translate from one file of a given format. */
export interface Reader {
  readonly format: SourceFormat;
  readonly read: (input: ReaderInput) => Occurrence[];
}

/** A file could not be read. The message always names the file. */
export class ReadError extends Error {
  readonly file: string;

  constructor(file: string, reason: string, options?: ErrorOptions) {
    super(`${file}: ${reason}`, options);
    this.name = "ReadError";
    this.file = file;
  }
}

/** Removes the UTF-8 byte order mark that some Windows editors add. */
export function stripBom(content: string): string {
  return content.startsWith("\uFEFF") ? content.slice(1) : content;
}
