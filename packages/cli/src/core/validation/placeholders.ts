/** Every placeholder syntax the validation knows. "markup" covers tags such as <b> or <RGB:1,0,0>. */
export const PLACEHOLDER_SYNTAXES = [
  "braces",
  "printf",
  "positional",
  "bbcode",
  "ass",
  "timestamp",
  "markup",
  "paradox",
  "renpy",
  "rimworld",
  "markdown",
] as const;
export type PlaceholderSyntax = (typeof PLACEHOLDER_SYNTAXES)[number];

/**
 * The syntaxes checked when the configuration does not choose. Format-specific ones are left out: "paradox", "renpy"
 * and "rimworld" treat a [word] as code, which is right in those games and wrong elsewhere, and "markdown" reads
 * backticks as code. They come with their format instead (see FORMAT_PLACEHOLDERS in config.ts).
 */
const FORMAT_SPECIFIC: readonly PlaceholderSyntax[] = ["paradox", "renpy", "rimworld", "markdown"];
export const DEFAULT_PLACEHOLDER_SYNTAXES: readonly PlaceholderSyntax[] = PLACEHOLDER_SYNTAXES.filter(
  (syntax) => !FORMAT_SPECIFIC.includes(syntax),
);

const PATTERNS: Readonly<Record<PlaceholderSyntax, RegExp>> = {
  // {name}, {0}, {}, {player.name}, {0:N2}, and Java's MessageFormat {0,number,integer} (no nested braces)
  braces: /\{[\w.:-]*(?:,[^{}]*)?\}/g,
  // %s, %d, %1$s, %5.2f, %-3i, %%, Python's %(name)s, Ruby's %{name}, Apple's %@, and the length modifiers of C
  // (%ld, %lld, %zu). No space flag, so "100% sure" is plain text.
  printf: /%(?:%|\{[\w.-]+\}|(?:\d+\$|\([\w.-]+\))?[-+#0]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j|L)?[sdifuxXoeEgGcqp@])/g,
  // %1, %2 (numbered, as in Project Zomboid); "%1$s" belongs to printf
  positional: /%\d+(?![\d$])/g,
  // [img=music], [color=255,0,0], [/color]; a word in brackets ("[Note]") is plain text
  bbcode: /\[(?:\/[A-Za-z]+|[A-Za-z]+=[^[\]]+)\]/g,
  // {\an8}, {\i1}, {\pos(320,50)}: ASS override codes, common in subtitles; a backslash must follow "{"
  ass: /\{\\[^{}]*\}/g,
  // <00:00:12.800>, <01:02.500>: WebVTT inline timestamps (karaoke)
  timestamp: /<(?:\d+:)?\d{2}:\d{2}\.\d{3}>/g,
  // <b>, </b>, <br/>, <RGB:1,0,0>, <LINE> (a letter must follow "<", so "a < b" is plain text)
  markup: /<\/?[A-Za-z][^<>]*>/g,
  // Paradox games: $VAR$ and $VAL|=+0$, colours §Y and §!, icons £gold£ (or £icon|1) and @icon!, ¤, scripted
  // localisation [Root.GetName] (any [...]), formatting #bold ... #!
  paradox: /\$[\w.|=+\-%*]+\$|§[A-Za-z0-9!]|£[\w|]+£?|¤|@\w+!|\[[^[\]\n]+\]|#!|#[A-Za-z][\w;:]*(?= )/g,
  // Ren'Py: escaped {{ and [[, text tags {b} {/b} {color=#f00} {w=0.5} {a=url}, interpolations [name] [items[0]]
  renpy: /\{\{|\[\[|\{[^{}]*\}|\[(?:[^[\]]|\[[^[\]]*\])*\]/g,
  // RimWorld: grammar symbols [PAWN_nameDef], and the rule head at the start of a rule: r_name-> or r_x(p=2)->
  rimworld: /^\w+(?:\([^()\n]*\))*->|\[[A-Za-z_]\w*\]/g,
  // Markdown: inline code (`x`, ``a ` b``), link and image destinations ](url "title"), reference links ][id].
  // The text of a link is translated; where it leads is not. No capturing group: the syntaxes are combined into one
  // pattern (placeholderPattern), where a back reference would point at another syntax's group.
  markdown: /``(?:[^`\n]|`(?!`))+``|`[^`\n]+`|\]\((?:[^()\s]|\([^()\s]*\))*(?:\s+"[^"\n]*")?\)|\]\[[^\]\n]+\]/g,
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
