import { parseArgs } from "node:util";
import { ProviderUnavailableError } from "../core/provider.js";
import { ReadError } from "../core/reader.js";
import { OutputError } from "../formats/project.js";
import { CsvError } from "../storage/csv.js";
import { MemoryFileError } from "../storage/memory-store.js";
import { VERSION } from "../version.js";
import { EXIT, GLOBAL_OPTIONS, OPTION_HELP, OPTIONS, UsageError, type CliOptions, type Command } from "./command.js";
import { buildCommand } from "./commands/build.js";
import { diffCommand } from "./commands/diff.js";
import { exportCommand } from "./commands/export.js";
import { extractCommand } from "./commands/extract.js";
import { importCommand } from "./commands/import.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { translateCommand } from "./commands/translate.js";
import type { CliIo } from "./io.js";
import { CliError, ConfigFileError } from "./project.js";

export { EXIT };

/** In the order of a typical workflow, which is also the order of the help. */
const COMMANDS: readonly Command[] = [
  initCommand,
  statusCommand,
  extractCommand,
  diffCommand,
  translateCommand,
  buildCommand,
  exportCommand,
  importCommand,
];

/** A Map, not an object: "constructor" or "__proto__" must not be found as commands. */
const BY_NAME = new Map(COMMANDS.map((command) => [command.name, command]));

/** Errors the user can fix: their message is enough, no stack trace. */
const EXPECTED_ERRORS = [
  CliError,
  ConfigFileError,
  CsvError,
  MemoryFileError,
  OutputError,
  ProviderUnavailableError,
  ReadError,
];

/** Runs one command line and returns the exit code. Never calls process.exit: tests run it directly. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let options: CliOptions;
  let positionals: string[];
  try {
    ({ values: options, positionals } = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    }));
  } catch (error) {
    return usageError(io, errorMessage(error));
  }

  if (options.version === true) {
    io.out(VERSION);
    return EXIT.ok;
  }

  const [name, ...args] = positionals;
  if (name === undefined || (name === "help" && args.length === 0)) {
    io.out(generalHelp());
    return EXIT.ok;
  }
  const helpTarget = name === "help" ? args[0] : undefined;
  const command = BY_NAME.get(helpTarget ?? name);
  if (command === undefined) return usageError(io, `unknown command "${helpTarget ?? name}"`);
  if (helpTarget !== undefined || options.help === true) {
    io.out(commandHelp(command));
    return EXIT.ok;
  }

  const allowed = new Set<string>([...GLOBAL_OPTIONS, ...command.options]);
  const wrongOption = Object.keys(options).find((option) => !allowed.has(option));
  if (wrongOption !== undefined) return usageError(io, `--${wrongOption} is not an option of "${command.name}"`);
  if (args.length > command.maxArgs) return usageError(io, `too many arguments for "${command.name}"`);

  try {
    return await command.run({ io, options, args });
  } catch (error) {
    if (error instanceof UsageError) return usageError(io, error.message);
    if (EXPECTED_ERRORS.some((type) => error instanceof type)) {
      io.err(`error: ${errorMessage(error)}`);
      return EXIT.error;
    }
    // A bug or an unexpected system error: the stack trace helps to report it.
    io.err(`unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    return EXIT.error;
  }
}

function usageError(io: CliIo, message: string): number {
  io.err(`error: ${message}`);
  io.err('Run "tradforge --help" for usage.');
  return EXIT.usage;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function generalHelp(): string {
  const width = Math.max(...COMMANDS.map((command) => command.name.length));
  return [
    `tradforge ${VERSION}: translate the texts of a project with a local AI model.`,
    "",
    "Usage: tradforge <command> [options]",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`),
    "",
    "Options:",
    ...GLOBAL_OPTIONS.map((option) => `  ${OPTION_HELP[option]}`),
    "",
    'Run "tradforge help <command>" for the options of a command.',
  ].join("\n");
}

function commandHelp(command: Command): string {
  return [
    `Usage: tradforge ${command.usage}`,
    "",
    command.summary,
    "",
    "Options:",
    ...[...command.options, ...GLOBAL_OPTIONS].map((option) => `  ${OPTION_HELP[option]}`),
  ].join("\n");
}
