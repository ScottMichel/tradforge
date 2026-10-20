/** Every placeholder syntax the validation knows. "markup" covers tags such as <b> or <RGB:1,0,0>. */
export const PLACEHOLDER_SYNTAXES = ["braces", "printf", "positional", "bbcode", "markup"] as const;
export type PlaceholderSyntax = (typeof PLACEHOLDER_SYNTAXES)[number];

const PATTERNS: Readonly<Record<PlaceholderSyntax, RegExp>> = {
  // {name}, {0}, {}, {player.name}, {0:N2}
  braces: /\{[\w.:-]*\}/g,
  // %s, %d, %1$s, %5.2f, %-3i, %% (no space flag, so "100% sure" is plain text)
  printf: /%(?:%|(?:\d+\$)?[-+#0]*\d*(?:\.\d+)?[sdifuxXoeEgGcq])/g,
  // %1, %2 (numbered, as in Project Zomboid); "%1$s" belongs to printf
  positional: /%\d+(?![\d$])/g,
  // [img=music], [color=255,0,0], [/color]; a word in brackets ("[Note]") is plain text
  bbcode: /\[(?:\/[A-Za-z]+|[A-Za-z]+=[^[\]]+)\]/g,
  // <b>, </b>, <br/>, <RGB:1,0,0>, <LINE> (a letter must follow "<", so "a < b" is plain text)
  markup: /<\/?[A-Za-z][^<>]*>/g,
};

/** Every token of one syntax, in order of appearance. */
export function findTokens(text: string, syntax: PlaceholderSyntax): string[] {
  return text.match(PATTERNS[syntax]) ?? [];
}

/** Replaces the tokens of the given syntaxes with a space. */
export function removeTokens(text: string, syntaxes: readonly PlaceholderSyntax[]): string {
  return syntaxes.reduce((result, syntax) => result.replace(PATTERNS[syntax], " "), text);
}

/** One global pattern matching the tokens of all the given syntaxes, e.g. to leave them alone while editing a text. */
export function placeholderPattern(syntaxes: readonly PlaceholderSyntax[]): RegExp {
  return new RegExp(syntaxes.map((syntax) => PATTERNS[syntax].source).join("|"), "g");
}
