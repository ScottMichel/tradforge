import path from "node:path";
import type { SourceConfig, TradforgeConfig } from "../../core/config.js";
import { languageName } from "../../core/languages.js";
import { formatFor } from "../registry.js";
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

const PLACEHOLDER = /\{(dir|name|stem|ext|lang|LANG|language)\}/g;

export interface OutputLanguages {
  readonly source: string;
  readonly target: string;
}

/**
 * Fills an output template from the source file and the languages:
 * {dir} {name} {ext} of the file, {lang} the target language, {LANG} the same in capitals (pt-BR → PT_BR),
 * {stem} the name without its source language suffix (UI_EN → UI, menu.en → menu).
 */
export function outputPath(template: string, file: string, languages: OutputLanguages): string {
  const ext = path.posix.extname(file);
  const name = path.posix.basename(file, ext);
  const values = new Map([
    ["dir", path.posix.dirname(file)],
    ["name", name],
    ["stem", stemOf(name, languages.source)],
    ["ext", ext],
    ["lang", languages.target],
    ["LANG", languages.target.toUpperCase().replaceAll("-", "_")],
    ["language", languageName(languages.target).toLowerCase().replaceAll(" ", "_")],
  ]);
  // One pass: a value that contains "{lang}" (from a file name) is not filled in again.
  const filled = template.replace(PLACEHOLDER, (_match, key: string) => values.get(key) ?? "");
  return path.posix.normalize(filled);
}

/**
 * The name without a trailing marker of the source language, whatever its case: "_EN", ".en", "-en",
 * and the "_l_english" of Paradox games.
 */
function stemOf(name: string, sourceLanguage: string): string {
  const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const code = escapeRegExp(sourceLanguage);
  const englishName = escapeRegExp(languageName(sourceLanguage).toLowerCase());
  return name.replace(new RegExp(`(?:[._-]${code}|_l_${englishName})$`, "i"), "");
}

/**
 * Every source file of the project with its output path, in configuration then file order.
 * Files that are the output of another file are left out: tradforge never reads its own translations.
 */
export async function listProjectFiles(root: string, config: TradforgeConfig): Promise<ProjectFile[]> {
  const found: ProjectFile[] = [];
  for (const source of config.sources) {
    for (const file of await findFiles(root, source.include, { exclude: [config.workDir] })) {
      const output = outputPath(source.output.path, file, {
        source: config.sourceLanguage,
        target: config.targetLanguage,
      });
      if (output === file && formatFor(source.format).multilingual !== true) {
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
    // a translation written by a previous build (a multilingual file is its own output: it stays)
    if (outputs.has(entry.file) && entry.output !== entry.file) continue;
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
