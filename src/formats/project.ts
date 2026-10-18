import path from "node:path";
import type { SourceConfig, TradforgeConfig } from "../core/config.js";
import { findFiles } from "./files.js";

/** An output path is wrong: it would overwrite a source, leave the project, or be shared by two files. */
export class OutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputError";
  }
}

/** A source file of the project, and where its translation goes. */
export interface ProjectFile {
  readonly source: SourceConfig;
  readonly file: string;
  readonly output: string;
}

const PLACEHOLDER = /\{(dir|name|ext|lang)\}/g;

/** Fills an output template: "{dir}/{name}.{lang}{ext}" + "locales/en/ui.json" + "fr" → "locales/en/ui.fr.json". */
export function outputPath(template: string, file: string, language: string): string {
  const ext = path.posix.extname(file);
  const values = new Map([
    ["dir", path.posix.dirname(file)],
    ["name", path.posix.basename(file, ext)],
    ["ext", ext],
    ["lang", language],
  ]);
  // One pass: a value that contains "{lang}" (from a file name) is not filled in again.
  const filled = template.replace(PLACEHOLDER, (_match, key: string) => values.get(key) ?? "");
  return path.posix.normalize(filled);
}

/**
 * Every source file of the project with its output path, in configuration then file order.
 * Files that are the output of another file are left out: tradforge never reads its own translations.
 */
export async function listProjectFiles(root: string, config: TradforgeConfig): Promise<ProjectFile[]> {
  const found: ProjectFile[] = [];
  for (const source of config.sources) {
    for (const file of await findFiles(root, source.include, { exclude: [config.workDir] })) {
      const output = outputPath(source.output.path, file, config.targetLanguage);
      if (output === file) {
        throw new OutputError(`${file}: the output path "${source.output.path}" would overwrite its source file`);
      }
      if (output === ".." || output.startsWith("../")) {
        throw new OutputError(`${file}: the output ${output} is outside the project folder`);
      }
      found.push({ source, file, output });
    }
  }

  const outputs = new Set(found.map((entry) => entry.output));
  const fileFor = new Map<string, string>();
  const files: ProjectFile[] = [];
  for (const entry of found) {
    if (outputs.has(entry.file)) continue; // a translation written by a previous build
    const other = fileFor.get(entry.output);
    if (other === entry.file) continue; // the same file matched by two sources: keep the first
    if (other !== undefined) {
      throw new OutputError(`${other} and ${entry.file} would both be written to the same output ${entry.output}`);
    }
    fileFor.set(entry.output, entry.file);
    files.push(entry);
  }
  return files;
}
