import path from "node:path";
import type { CommandContext } from "./command.js";
import { ConfigFileError, openProject, type Project } from "./config-file.js";

export { ConfigFileError, type Project };

/** Opens the project of the command: --config, or tradforge.config.json in the current folder. */
export function projectOf({ io, options }: CommandContext): Promise<Project> {
  return openProject(io.cwd, options.config);
}

/** A path as the user should read it: relative to the folder they run from. */
export function displayPath(cwd: string, file: string): string {
  return path.relative(cwd, file) || ".";
}

/** Something went wrong that the user can fix (exit code 1). */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}
