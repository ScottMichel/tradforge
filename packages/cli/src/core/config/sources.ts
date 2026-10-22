import { INPUT_ENCODINGS, type InputEncoding, TEXT_ENCODINGS, type TextEncoding } from "../encodings.js";
import { isObject } from "../json.js";
import {
  errorMessage,
  parseBoolean,
  parseChoice,
  parseInteger,
  parseString,
  parseStringList,
  type Report,
} from "./parse.js";

/** Every format a reader exists for. Single source of truth for validation and types. */
export const SOURCE_FORMATS = [
  "android",
  "arb",
  "docx",
  "html",
  "ios-strings",
  "json",
  "lua",
  "markdown",
  "odt",
  "paradox-yml",
  "po",
  "pptx",
  "properties",
  "renpy",
  "resx",
  "rimworld-xml",
  "srt",
  "vtt",
  "xcstrings",
  "xliff",
  "xlsx",
  "yaml",
  "zomboid-txt",
] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

/** What to do with a text that has no translation: keep the source text, or leave it out (JSON keys only). */
export const UNTRANSLATED_MODES = ["keep-source", "omit"] as const;
export type UntranslatedMode = (typeof UNTRANSLATED_MODES)[number];

/** Placeholders of an output path template, e.g. "locales/{lang}/{name}{ext}". */
export const OUTPUT_PLACEHOLDERS = ["dir", "name", "stem", "ext", "lang", "LANG", "language"] as const;

export interface OutputConfig {
  /** Path of the translated file, relative to the project root. {dir}, {name} and {ext} come from the source file. */
  readonly path: string;
  /** Escape every non-ASCII character, for games that read UTF-8 badly. */
  readonly asciiOnly: boolean;
  readonly untranslated: UntranslatedMode;
  /** Encoding of the translated files: a game may expect a legacy code page such as windows-1252. */
  readonly encoding: TextEncoding;
}

/** Next to the source file: locales/en/ui.json → locales/en/ui.fr.json. Never overwrites the source. */
export const DEFAULT_OUTPUT: OutputConfig = {
  path: "{dir}/{name}.{lang}{ext}",
  asciiOnly: false,
  untranslated: "keep-source",
  encoding: "utf-8",
};

/**
 * How texts are grouped into conversations, kept in one batch whenever possible.
 * auto: the reader decides (same JSON object, Lua lines with no blank line between them).
 * none: no groups. file: one group per file. keyPattern: texts whose keys give the same first capture group.
 */
export type GroupRule = "auto" | "none" | "file" | { readonly keyPattern: string };

export const GROUP_MODES = ["auto", "none", "file"] as const;

export interface SourceConfig {
  readonly format: SourceFormat;
  /** Glob patterns, relative to the project root. */
  readonly include: readonly string[];
  /** Lower value = translated first. May be negative. */
  readonly priority: number;
  /** Hint for the translator about how these texts are used. */
  readonly context?: string;
  readonly group: GroupRule;
  /** Encoding of the source files. auto: byte order mark, then valid UTF-8, then windows-1252. */
  readonly encoding: InputEncoding;
  /** Where and how to write the translated files. */
  readonly output: OutputConfig;
}

const DEFAULT_PRIORITY = 0;

export function parseSources(value: unknown, report: Report): SourceConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    report("sources", "must be a non-empty array");
    return [];
  }
  return value.map((source: unknown, index) => parseSource(source, `sources[${index}]`, report));
}

function parseSource(value: unknown, path: string, report: Report): SourceConfig {
  if (!isObject(value)) {
    report(path, "must be an object");
    return {
      format: SOURCE_FORMATS[0],
      include: [],
      priority: DEFAULT_PRIORITY,
      group: "auto",
      encoding: "auto",
      output: DEFAULT_OUTPUT,
    };
  }
  // Parsed in field order, so that problems are reported in that order too.
  const format = parseChoice(SOURCE_FORMATS, value.format, `${path}.format`, report);
  const include = parseStringList(value.include, `${path}.include`, report);
  const priority = parseInteger(value.priority, `${path}.priority`, report, DEFAULT_PRIORITY);
  const context = value.context === undefined ? undefined : parseString(value.context, `${path}.context`, report);
  const group = parseGroupRule(value.group, `${path}.group`, report);
  const encoding = parseChoice(INPUT_ENCODINGS, value.encoding, `${path}.encoding`, report, "auto");
  const output = parseOutput(value.output, `${path}.output`, report);
  return { format, include, priority, ...(context !== undefined ? { context } : {}), group, encoding, output };
}

function parseGroupRule(value: unknown, path: string, report: Report): GroupRule {
  if (value === undefined) return "auto";
  if (isObject(value)) {
    const keyPattern = parseString(value.keyPattern, `${path}.keyPattern`, report);
    try {
      new RegExp(keyPattern, "u");
    } catch (error) {
      report(`${path}.keyPattern`, `is not a valid regular expression (${errorMessage(error)})`);
    }
    return { keyPattern };
  }
  const mode = GROUP_MODES.find((m) => m === value);
  if (mode !== undefined) return mode;
  report(path, `must be one of ${GROUP_MODES.join(", ")}, or { "keyPattern": "<regular expression>" }`);
  return "auto";
}

const TEMPLATE_PLACEHOLDER = /\{([^{}]*)\}/g;
const ABSOLUTE_PATH = /^([a-zA-Z]:)?[\\/]/;

function parseOutput(value: unknown, path: string, report: Report): OutputConfig {
  if (value === undefined) return DEFAULT_OUTPUT;
  if (!isObject(value)) {
    report(path, "must be an object");
    return DEFAULT_OUTPUT;
  }
  const template = parseString(value.path, `${path}.path`, report, DEFAULT_OUTPUT.path);
  checkOutputTemplate(template, `${path}.path`, report);
  const asciiOnly = parseBoolean(value.asciiOnly, `${path}.asciiOnly`, report, DEFAULT_OUTPUT.asciiOnly);
  const untranslated = parseChoice(
    UNTRANSLATED_MODES,
    value.untranslated,
    `${path}.untranslated`,
    report,
    DEFAULT_OUTPUT.untranslated,
  );
  const encoding = parseChoice(TEXT_ENCODINGS, value.encoding, `${path}.encoding`, report, DEFAULT_OUTPUT.encoding);
  return { path: template, asciiOnly, untranslated, encoding };
}

/** Reports the first problem of an output path template: an absolute path, or an unknown placeholder. */
function checkOutputTemplate(template: string, path: string, report: Report): void {
  if (ABSOLUTE_PATH.test(template)) {
    report(path, "must be relative to the project root");
    return;
  }
  const known: readonly string[] = OUTPUT_PLACEHOLDERS;
  for (const [placeholder, name = ""] of template.matchAll(TEMPLATE_PLACEHOLDER)) {
    if (!known.includes(name)) {
      const list = OUTPUT_PLACEHOLDERS.map((p) => `{${p}}`).join(", ");
      report(path, `unknown placeholder ${placeholder} (use ${list})`);
      return;
    }
  }
}
