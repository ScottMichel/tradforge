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

export interface ConfigDraft {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  /** Sources found by detection. Without them, a commented example source is written. */
  readonly sources?: readonly {
    readonly format: string;
    readonly include: readonly string[];
    readonly output: string;
    /** Output encoding the format requires (Paradox: utf-8-bom). */
    readonly encoding?: string;
  }[];
}

/** Written by "tradforge init": a working starting point that explains every setting. */
export function renderConfig(draft: ConfigDraft): string {
  const sources =
    draft.sources === undefined || draft.sources.length === 0
      ? [
          {
            format: "json",
            include: [`locales/${draft.sourceLanguage}/*.json`],
            priority: 0,
            context: "User interface",
            output: { path: "locales/{lang}/{name}{ext}", asciiOnly: false, untranslated: "keep-source" },
          },
        ]
      : draft.sources.map((source) => ({
          format: source.format,
          include: source.include,
          output: { path: source.output, ...(source.encoding !== undefined ? { encoding: source.encoding } : {}) },
        }));

  return `{
  // Language of the texts in your project, and language to translate them into.
  "sourceLanguage": ${JSON.stringify(draft.sourceLanguage)},
  "targetLanguage": ${JSON.stringify(draft.targetLanguage)},

  // Folder where tradforge keeps its translation memory. Worth committing: it holds all the work.
  "workDir": ".tradforge",

  // Files to translate. Formats: "json", "yaml", "markdown", "html", "docx" (Word), "pptx" (PowerPoint),
  // "xlsx" (Excel), "odt" (OpenDocument), "lua", "po" (gettext), "xliff", "android" (res/values/strings.xml),
  // "ios-strings" (Apple .strings), "xcstrings" (Xcode catalogs, translated in place), "properties" (Java),
  // "resx" (.NET), "arb" (Flutter), "srt", "vtt", "renpy" (Ren'Py scripts), "zomboid-txt" (Project Zomboid Build 41
  // tables), "paradox-yml" (Paradox localisation), "rimworld-xml" (RimWorld language files).
  // Check the output paths before running "tradforge build".
  // Lower "priority" = translated first (default 0). "context" helps the model choose the right meaning.
  // "group": "auto" (default), "none", "file", or { "keyPattern": "^Dialog_(\\\\w+)_" } to keep conversations together.
  // Output path placeholders: {dir}, {name}, {ext} of the source file, {stem} = name without its "_en" suffix,
  // {lang} = targetLanguage, {LANG} = the same in capitals, {language} = its English name ("french").
  // "encoding" of the source files: "auto" (default), "utf-8", "windows-1252"...
  // "output.encoding": "utf-8" (default), "utf-8-bom", "utf-16le", "windows-1252"... for games that expect one.
  // "asciiOnly": escape accents, for games that display UTF-8 badly.
  // "untranslated": "keep-source" or "omit" (JSON keys only).
  "sources": ${indent(JSON.stringify(sources, null, 2), "  ")},

  // Local model served by Ollama (https://ollama.com). Install it with: ollama pull mistral-small
  // Any OpenAI-compatible API works too (OpenAI, Mistral, OpenRouter, Groq, LM Studio, vLLM):
  //   { "type": "openai-compatible", "model": "gpt-5-mini", "baseUrl": "https://api.openai.com/v1",
  //     "apiKeyEnv": "OPENAI_API_KEY" }
  // Claude: { "type": "anthropic", "model": "claude-haiku-5-5" } (key in ANTHROPIC_API_KEY).
  // Gemini: { "type": "gemini", "model": "gemini-flash-latest" } (key in GEMINI_API_KEY).
  // DeepL: { "type": "deepl", "formality": "prefer_less" } (key in DEEPL_API_KEY).
  // The API key is read from that environment variable: never write it in this file.
  // "responseFormat": "json-schema" (default), or "json-object" / "none" for servers that refuse schemas.
  // "pricing": { "inputPerMillion": 0.4, "outputPerMillion": 1.6 } from your API's price list: "translate --dry-run"
  // then estimates the cost.
  "provider": { "type": "ollama", "model": "mistral-small", "host": "http://localhost:11434" },

  "translation": {
    // Texts sent to the model in one request.
    "batchSize": 20,
    // Batches sent at the same time: 1 for a local model, 4 to 8 for a remote API.
    "concurrency": 1,
    // Sent to the model with every batch: tone, audience, conventions...
    "instructions": "Video game texts. Keep a natural, casual tone.",
    // Terms that must always be translated the same way.
    "glossary": { "NPC": "PNJ" },
    // Lines sent before and after each batch, for context only (0 = none).
    "contextLines": 3,
    // Typography of the target language (French: non-breaking space before ; : ! ?).
    "typography": true,
    // Reuse the translation of a text that only changed slightly.
    "reuse": true
  },

  // Placeholder syntaxes that translations must keep: "braces" {name}, "printf" %s, "markup" <b>.
  // "glossary": reject a translation that does not follow the glossary.
  "validation": { "placeholders": ["braces", "printf", "markup"], "glossary": true }
}
`;
}

/** The commented example configuration, for a project whose files were not detected. */
export const CONFIG_TEMPLATE = renderConfig({ sourceLanguage: "en", targetLanguage: "fr" });

/** Indents every line but the first: the value is placed after a key on the first line. */
function indent(text: string, prefix: string): string {
  return text.replaceAll("\n", `\n${prefix}`);
}
