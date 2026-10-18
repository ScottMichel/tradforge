import { isObject, type JsonObject } from "../core/json.js";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { TranslationMemory, type MemoryLanguages } from "../core/memory.js";
import { stripBom } from "../core/reader.js";
import type { FailedTranslation, TranslationEntry, TranslationStatus } from "../core/types.js";
import { writeFileAtomic } from "./atomic.js";

const MEMORY_FILE = "memory.json";
const VERSION = 1;
const STATUSES: readonly TranslationStatus[] = ["machine", "reviewed"];

/** The memory file is missing a field, has a wrong value, or is not JSON. */
export class MemoryFileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MemoryFileError";
  }
}

export interface MemoryFileData {
  readonly languages: MemoryLanguages;
  readonly entries: TranslationEntry[];
  readonly failures: FailedTranslation[];
}

export function memoryFilePath(workDir: string): string {
  return path.join(workDir, MEMORY_FILE);
}

/** Loads the memory of the work directory, or an empty one if there is no file yet. */
export async function loadMemory(workDir: string, languages: MemoryLanguages): Promise<TranslationMemory> {
  const file = memoryFilePath(workDir);
  const content = await readIfExists(file);
  if (content === undefined) return new TranslationMemory({ languages });

  const data = parseContent(file, content);
  if (!sameLanguages(data.languages, languages)) {
    throw new MemoryFileError(
      `${file}: this memory is for ${describe(data.languages)}, but the configuration asks for ${describe(languages)}`,
    );
  }
  return new TranslationMemory({ languages, entries: data.entries, failures: data.failures });
}

/** Saves the memory atomically: an interruption never leaves a half-written file. */
export async function saveMemory(workDir: string, memory: TranslationMemory): Promise<void> {
  await mkdir(workDir, { recursive: true });
  await writeFileAtomic(memoryFilePath(workDir), serializeMemory(memory));
}

/** Indented, sorted JSON with a fixed key order: the file diffs cleanly in Git. */
export function serializeMemory(memory: TranslationMemory): string {
  const data = {
    version: VERSION,
    sourceLanguage: memory.languages.sourceLanguage,
    targetLanguage: memory.languages.targetLanguage,
    entries: memory.entryList().map((entry) => ({
      source: entry.source,
      target: entry.target,
      status: entry.status,
      ...(entry.model !== undefined ? { model: entry.model } : {}),
      updatedAt: entry.updatedAt,
    })),
    failures: memory.failureList().map((failure) => ({
      source: failure.source,
      reason: failure.reason,
      attempts: failure.attempts,
      ...(failure.model !== undefined ? { model: failure.model } : {}),
      updatedAt: failure.updatedAt,
    })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Turns the parsed JSON of a memory file into typed data, or throws a MemoryFileError. */
export function parseMemoryFile(raw: unknown): MemoryFileData {
  const root = expectObject(raw, "(root)");
  if (root.version !== VERSION) {
    throw new MemoryFileError(`unsupported version ${String(root.version)}, expected ${VERSION}`);
  }
  return {
    languages: {
      sourceLanguage: expectText(root.sourceLanguage, "sourceLanguage"),
      targetLanguage: expectText(root.targetLanguage, "targetLanguage"),
    },
    entries: expectArray(root.entries, "entries").map((item, index) => parseEntry(item, `entries[${index}]`)),
    failures: expectArray(root.failures, "failures").map((item, index) => parseFailure(item, `failures[${index}]`)),
  };
}

function parseEntry(value: unknown, path: string): TranslationEntry {
  const entry = expectObject(value, path);
  const source = expectString(entry.source, `${path}.source`);
  const target = expectString(entry.target, `${path}.target`);
  const status = STATUSES.find((s) => s === entry.status);
  if (status === undefined) throw new MemoryFileError(`${path}.status: must be one of ${STATUSES.join(", ")}`);
  const model = entry.model === undefined ? undefined : expectText(entry.model, `${path}.model`);
  const updatedAt = expectText(entry.updatedAt, `${path}.updatedAt`);
  return { source, target, status, ...(model !== undefined ? { model } : {}), updatedAt };
}

function parseFailure(value: unknown, path: string): FailedTranslation {
  const failure = expectObject(value, path);
  const source = expectString(failure.source, `${path}.source`);
  const reason = expectText(failure.reason, `${path}.reason`);
  const attempts = failure.attempts;
  if (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 1) {
    throw new MemoryFileError(`${path}.attempts: must be an integer greater than or equal to 1`);
  }
  const model = failure.model === undefined ? undefined : expectText(failure.model, `${path}.model`);
  const updatedAt = expectText(failure.updatedAt, `${path}.updatedAt`);
  return { source, reason, attempts, ...(model !== undefined ? { model } : {}), updatedAt };
}


function expectObject(value: unknown, path: string): JsonObject {
  if (isObject(value)) return value;
  throw new MemoryFileError(`${path}: must be an object`);
}

function expectArray(value: unknown, path: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new MemoryFileError(`${path}: must be an array`);
}

function expectString(value: unknown, path: string): string {
  if (typeof value === "string") return value;
  throw new MemoryFileError(`${path}: must be a string`);
}

/** A string that must not be empty. */
function expectText(value: unknown, path: string): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  throw new MemoryFileError(`${path}: must be a non-empty string`);
}

function parseContent(file: string, content: string): MemoryFileData {
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(content));
  } catch (error) {
    throw new MemoryFileError(`${file}: invalid JSON (${errorMessage(error)})`, { cause: error });
  }
  try {
    return parseMemoryFile(raw);
  } catch (error) {
    if (error instanceof MemoryFileError) throw new MemoryFileError(`${file}: ${error.message}`, { cause: error });
    throw error;
  }
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sameLanguages(a: MemoryLanguages, b: MemoryLanguages): boolean {
  return a.sourceLanguage === b.sourceLanguage && a.targetLanguage === b.targetLanguage;
}

function describe(languages: MemoryLanguages): string {
  return `${languages.sourceLanguage} → ${languages.targetLanguage}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
