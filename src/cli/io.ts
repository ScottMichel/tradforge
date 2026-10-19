import type { ProviderConfig } from "../core/config.js";
import type { Provider } from "../core/provider.js";

/**
 * Everything the CLI needs from the outside world. The real process provides it in bin.ts;
 * tests provide a temporary folder, arrays for the output and a mock provider.
 */
export interface CliIo {
  /** Folder the command runs from. */
  readonly cwd: string;
  /** Prints one line of normal output. */
  readonly out: (line: string) => void;
  /** Prints one line of error output. */
  readonly err: (line: string) => void;
  /** Aborted on Ctrl+C. */
  readonly signal?: AbortSignal;
  /** Replaces the provider of the configuration (tests). */
  readonly createProvider?: (config: ProviderConfig) => Provider;
}
