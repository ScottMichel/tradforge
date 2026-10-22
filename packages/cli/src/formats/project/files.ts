import type { Dirent } from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";

/** Directories that never hold source texts, skipped at any depth. */
const ALWAYS_EXCLUDED = new Set(["node_modules", ".git"]);

export interface FindFilesOptions {
  /** Directories to skip, relative to the root (e.g. the work directory). */
  readonly exclude?: readonly string[];
}

/** Finds the files matching the patterns: paths relative to root, with "/" separators, sorted. */
export async function findFiles(
  root: string,
  patterns: readonly string[],
  options: FindFilesOptions = {},
): Promise<string[]> {
  const excluded = new Set((options.exclude ?? []).map(toProjectPath));
  const files: string[] = [];

  const entries = glob(patterns, {
    cwd: root,
    withFileTypes: true,
    // Returning true for a directory also stops glob from walking into it.
    exclude: (entry) =>
      entry.isDirectory() && (ALWAYS_EXCLUDED.has(entry.name) || excluded.has(relativePath(root, entry))),
  });
  for await (const entry of entries) {
    if (entry.isFile()) files.push(relativePath(root, entry));
  }

  // Default sort compares UTF-16 code units: same order on every machine.
  return files.sort();
}

function relativePath(root: string, entry: Dirent): string {
  return toProjectPath(path.relative(root, path.join(entry.parentPath, entry.name)));
}

/** Normalizes a project path: "/" separators, no leading "./", no trailing "/". */
function toProjectPath(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}
