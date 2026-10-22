import {
  ConfigError,
  ConfigFileError,
  CsvError,
  EncodingError,
  MemoryFileError,
  OutputError,
  ProviderUnavailableError,
  ReadError,
} from "tradforge";
import type { ErrorCode, ErrorView } from "../shared/bridge.js";

/** An error of the application itself: its code and values, worded by the page in the language of the interface. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly params: Readonly<Record<string, string>> = {},
    message: string = code,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Any error, as the page shows it: an explanation chosen by its kind, and the technical message as detail. */
export function describeError(error: unknown): ErrorView {
  if (error instanceof AppError) return { code: error.code, params: error.params };
  const detail = error instanceof Error ? error.message : String(error);
  return { code: codeOf(error), params: {}, detail };
}

function codeOf(error: unknown): ErrorCode {
  if (error instanceof ConfigError || error instanceof ConfigFileError) return "config-invalid";
  if (error instanceof ReadError || error instanceof EncodingError || error instanceof CsvError)
    return "file-unreadable";
  if (error instanceof OutputError) return "output-refused";
  if (error instanceof ProviderUnavailableError) return "engine-unavailable";
  if (error instanceof MemoryFileError) return "memory-unreadable";
  return "unexpected";
}
