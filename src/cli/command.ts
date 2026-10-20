import type { CliIo } from "./io.js";

/** Options understood by parseArgs. Each command lists the ones it accepts. */
export const OPTIONS = {
  config: { type: "string", short: "c" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  force: { type: "boolean" },
  limit: { type: "string" },
  only: { type: "string" },
  retry: { type: "boolean" },
  "dry-run": { type: "boolean" },
  keep: { type: "boolean" },
  json: { type: "boolean" },
  from: { type: "string" },
  to: { type: "string" },
} as const;

export type OptionName = keyof typeof OPTIONS;

/** Options accepted by every command. */
export const GLOBAL_OPTIONS: readonly OptionName[] = ["config", "help", "version"];

export const OPTION_HELP: Readonly<Record<OptionName, string>> = {
  config: "-c, --config <file>  Configuration file (default: tradforge.config.json)",
  help: "-h, --help           Show help",
  version: "-v, --version        Show the version",
  force: "--force              Replace existing files even when this looks like a mistake",
  limit: "--limit <n>          Translate at most n texts",
  only: "--only <path>        Only the texts of this file or folder",
  retry: "--retry              Also retry the texts that failed before",
  "dry-run": "--dry-run            Show what would be translated, without calling the model",
  keep: "--keep               Do not replace translations that already exist",
  json: "--json               Print the texts as JSON",
  from: "--from <lang>        Language of the texts (default: en)",
  to: "--to <lang>          Language to translate into (default: fr)",
};

export interface CliOptions {
  readonly config?: string | undefined;
  readonly help?: boolean | undefined;
  readonly version?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly limit?: string | undefined;
  readonly only?: string | undefined;
  readonly retry?: boolean | undefined;
  readonly "dry-run"?: boolean | undefined;
  readonly keep?: boolean | undefined;
  readonly json?: boolean | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

export interface CommandContext {
  readonly io: CliIo;
  readonly options: CliOptions;
  /** Positional arguments after the command name. */
  readonly args: readonly string[];
}

export interface Command {
  readonly name: string;
  readonly summary: string;
  /** e.g. "import <file.csv> [--keep]" */
  readonly usage: string;
  readonly options: readonly OptionName[];
  readonly maxArgs: number;
  /** Returns the exit code. */
  readonly run: (context: CommandContext) => Promise<number>;
}

/** A command line that makes no sense: wrong option, missing argument... (exit code 2). */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export const EXIT = {
  ok: 0,
  /** Something went wrong: configuration, files, model... */
  error: 1,
  /** The command line itself is wrong. */
  usage: 2,
  /** Ctrl+C (128 + SIGINT, the shell convention). */
  interrupted: 130,
} as const;
