/** printf-style specifiers (%s, %5.2f, %%) and Lua pattern classes (%a, %d). */
const PERCENT_CODE = /%[-+ #0-9.]*[a-zA-Z%]/g;
const LETTER = /\p{L}/u;
const ASSIGNMENT = /\w=/;
const WHITESPACE = /\s/;

/** Shapes of a single token that names something instead of saying something. */
const IDENTIFIER_SHAPES = [
  /_/, // snake_case, ALL_CAPS_CONSTANT
  /^[a-z][a-z0-9]*$/, // lowercase word: "idle", "item2"
  /^[a-z]+[A-Z]/, // camelCase
  /^[A-Z][a-z0-9]+[A-Z]/, // PascalCase
  /\w[.:]\w/, // Base.Axe, module:method
  /[/\\]/, // paths and URLs
];

/**
 * Heuristic: does this Lua string look like text for humans rather than code data?
 * Errs on the side of keeping a single capitalized word ("Quit", "OK").
 */
export function isNaturalText(text: string): boolean {
  const trimmed = text.trim();
  if (!LETTER.test(trimmed.replace(PERCENT_CODE, ""))) return false;
  if (ASSIGNMENT.test(trimmed)) return false;
  if (WHITESPACE.test(trimmed)) return true;
  return !IDENTIFIER_SHAPES.some((shape) => shape.test(trimmed));
}
