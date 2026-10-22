import { isObject } from "../json.js";
import {
  DEFAULT_PLACEHOLDER_SYNTAXES,
  PLACEHOLDER_SYNTAXES,
  type PlaceholderSyntax,
} from "../validation/placeholders.js";
import { parseBoolean, parseChoice, type Report } from "./parse.js";

export interface ValidationConfig {
  /** Placeholder syntaxes that translations must preserve. Empty disables the check. */
  readonly placeholders: readonly PlaceholderSyntax[];
  /** Reject a translation that does not use the glossary translation of a term found in the source. */
  readonly glossary: boolean;
}

export function parseValidation(value: unknown, report: Report): ValidationConfig {
  if (value === undefined) return { placeholders: [...DEFAULT_PLACEHOLDER_SYNTAXES], glossary: true };
  if (!isObject(value)) {
    report("validation", "must be an object");
    return { placeholders: [], glossary: true };
  }
  const placeholders = parsePlaceholderSyntaxes(value.placeholders, report);
  const glossary = parseBoolean(value.glossary, "validation.glossary", report, true);
  return { placeholders, glossary };
}

function parsePlaceholderSyntaxes(value: unknown, report: Report): PlaceholderSyntax[] {
  if (value === undefined) return [...DEFAULT_PLACEHOLDER_SYNTAXES];
  if (!Array.isArray(value)) {
    report("validation.placeholders", `must be an array of ${PLACEHOLDER_SYNTAXES.join(", ")}`);
    return [];
  }
  return value.map((syntax: unknown, index) =>
    parseChoice(PLACEHOLDER_SYNTAXES, syntax, `validation.placeholders[${index}]`, report),
  );
}
