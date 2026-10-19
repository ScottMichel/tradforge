import path from "node:path";
import { ConfigError, parseConfig, type TradforgeConfig } from "../core/config.js";
import { stripBom } from "../core/reader.js";
import { readFileIfExists } from "../storage/read.js";

export const CONFIG_FILE = "tradforge.config.json";

/** The configuration file is missing, is not JSON, or describes an invalid configuration. */
export class ConfigFileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigFileError";
  }
}

export interface Project {
  /** Folder of the configuration file: every path of the configuration is relative to it. */
  readonly root: string;
  readonly configFile: string;
  readonly config: TradforgeConfig;
  /** Absolute path of the work directory (memory...). */
  readonly workDir: string;
}

/** Reads and parses the configuration: the adapter between the disk and parseConfig. */
export async function openProject(cwd: string, configFile?: string): Promise<Project> {
  const file = path.resolve(cwd, configFile ?? CONFIG_FILE);
  const content = await readFileIfExists(file);
  if (content === undefined) {
    throw new ConfigFileError(`no configuration found at ${file}. Run "tradforge init" to create one.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonComments(stripBom(content)));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigFileError(`${file}: invalid JSON (${detail})`, { cause: error });
  }

  let config: TradforgeConfig;
  try {
    config = parseConfig(raw);
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigFileError(`${file}: ${error.message}`, { cause: error });
    throw error;
  }

  const root = path.dirname(file);
  return { root, configFile: file, config, workDir: path.resolve(root, config.workDir) };
}

/**
 * Removes // and /* *\/ comments outside strings, so that the configuration can explain itself.
 * Comments become spaces (line breaks are kept), so JSON error positions stay meaningful.
 */
export function stripJsonComments(text: string): string {
  let result = "";
  let pos = 0;
  while (pos < text.length) {
    const char = text.charAt(pos);
    const next = text.charAt(pos + 1);
    if (char === '"') {
      const end = endOfString(text, pos);
      result += text.slice(pos, end);
      pos = end;
    } else if (char === "/" && next === "/") {
      const end = text.indexOf("\n", pos);
      const stop = end === -1 ? text.length : end;
      result += " ".repeat(stop - pos);
      pos = stop;
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", pos + 2);
      const stop = end === -1 ? text.length : end + 2;
      result += text.slice(pos, stop).replace(/[^\r\n]/g, " ");
      pos = stop;
    } else {
      result += char;
      pos++;
    }
  }
  return result;
}

/** Position just after the closing quote of the string that starts at `start`. */
function endOfString(text: string, start: number): number {
  let pos = start + 1;
  while (pos < text.length) {
    const char = text.charAt(pos);
    if (char === "\\") pos += 2;
    else if (char === '"') return pos + 1;
    else pos++;
  }
  return text.length; // unterminated: JSON.parse will report it
}

/** Written by "tradforge init": a working starting point that explains every setting. */
export const CONFIG_TEMPLATE = `{
  // Language of the texts in your project, and language to translate them into.
  "sourceLanguage": "en",
  "targetLanguage": "fr",

  // Folder where tradforge keeps its translation memory. Worth committing: it holds all the work.
  "workDir": ".tradforge",

  // Files to translate. Formats: "json", "lua".
  // Lower "priority" = translated first. "context" helps the model choose the right meaning.
  // Output path placeholders: {dir}, {name}, {ext} of the source file, {lang} = targetLanguage.
  // "asciiOnly": escape accents, for games that display UTF-8 badly.
  // "untranslated": "keep-source" or "omit" (JSON keys only).
  "sources": [
    {
      "format": "json",
      "include": ["locales/en/*.json"],
      "priority": 0,
      "context": "User interface",
      "output": { "path": "locales/{lang}/{name}{ext}", "asciiOnly": false, "untranslated": "keep-source" }
    }
  ],

  // Local model served by Ollama (https://ollama.com). Install it with: ollama pull mistral-small
  "provider": { "type": "ollama", "model": "mistral-small", "host": "http://localhost:11434" },

  "translation": {
    // Texts sent to the model in one request.
    "batchSize": 20,
    // Sent to the model with every batch: tone, audience, conventions...
    "instructions": "Video game texts. Keep a natural, casual tone.",
    // Terms that must always be translated the same way.
    "glossary": { "NPC": "PNJ" }
  },

  // Placeholder syntaxes that translations must keep: "braces" {name}, "printf" %s, "markup" <b>.
  "validation": { "placeholders": ["braces", "printf", "markup"] }
}
`;
