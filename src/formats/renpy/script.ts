import { type Literal, logicalLines, type Token } from "./lexer.js";
import { decodePythonString, decodeRenpyString, type MonologueMode, splitMonologue } from "./strings.js";

/** How the text was written, so that the writer writes its translation the same way. */
export type TextEncoding =
  /** A single-line Ren'Py string: dialogue or menu choice. */
  | { readonly kind: "renpy" }
  /** One paragraph of a triple-quoted dialogue string, which holds several lines of dialogue. */
  | {
      readonly kind: "monologue";
      readonly index: number;
      readonly paragraphs: readonly string[];
      readonly mode: MonologueMode;
    }
  /** A Python string, marked with _(), __() or _p(). */
  | { readonly kind: "python" };

/** A text of a Ren'Py script that a player reads. */
export interface RenpyText {
  readonly value: string;
  /** 1-based line of the text. */
  readonly line: number;
  /** Where the text is: a label ("start", "day1.evening"), a screen ("screen main_menu") or "(top)". */
  readonly scope: string;
  /** 1-based rank of the text in its scope. */
  readonly index: number;
  /** False outside labels and screens. */
  readonly grouped: boolean;
  readonly literal: Literal;
  readonly encoding: TextEncoding;
}

/** What the lines of a block are. */
type BlockKind =
  /** Ren'Py statements: dialogue is read. */
  | "script"
  /** The items of a menu: choices and dialogue. */
  | "menu"
  /** Python, screens, styles, transforms...: only strings marked with _() are read. */
  | "code"
  /** An existing translation: nothing is read. */
  | "skip";

interface Block {
  readonly indent: number;
  readonly kind: BlockKind;
  readonly scope: string | undefined;
}

const TOP = "(top)";

/** Statements whose strings are never dialogue (Ren'Py tries "say" last, after every other statement). */
const STATEMENTS = new Set([
  "as",
  "at",
  "behind",
  "call",
  "camera",
  "default",
  "define",
  "elif",
  "else",
  "expression",
  "for",
  "hide",
  "if",
  "image",
  "in",
  "init",
  "jump",
  "label",
  "layeredimage",
  "menu",
  "nvl",
  "onlayer",
  "pass",
  "pause",
  "play",
  "python",
  "queue",
  "return",
  "rpy",
  "scene",
  "screen",
  "show",
  "stop",
  "style",
  "testcase",
  "transform",
  "translate",
  "voice",
  "while",
  "window",
  "with",
  "zorder",
]);

/** Blocks that hold Ren'Py statements. */
const SCRIPT_BLOCKS = new Set(["label", "menu", "if", "elif", "else", "while", "for", "init"]);

const TRANSLATABLE = new Set(["_", "__", "_p"]);
const HAS_LETTER = /\p{L}/u;
const ATTRIBUTE = /^[\p{L}\p{N}_]+$/u;

/** Every text a player reads in a Ren'Py script, in order. */
export function extractRenpyTexts(source: string): RenpyText[] {
  const texts: RenpyText[] = [];
  const counters = new Map<string, number>();
  const stack: Block[] = [];
  let globalLabel: string | undefined;
  let mode: MonologueMode = "double";

  const add = (scope: string | undefined, value: string, line: number, literal: Literal, encoding: TextEncoding) => {
    if (!HAS_LETTER.test(value)) return; // "...", "", "{w=1.0}": nothing to translate
    const name = scope ?? TOP;
    const index = (counters.get(name) ?? 0) + 1;
    counters.set(name, index);
    texts.push({ value, line, scope: name, index, grouped: scope !== undefined, literal, encoding });
  };

  for (const logical of logicalLines(source)) {
    while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= logical.indent) stack.pop();
    const parent = stack.at(-1);
    const kind = parent?.kind ?? "script";
    const scope = parent?.scope;
    if (kind === "skip") continue;

    const { tokens } = logical;
    const first = tokens[0];
    const opensBlock = isPunct(tokens.at(-1), ":");
    const word = first?.kind === "word" ? first.text : undefined;
    let used: Literal | undefined;
    let child: Block | undefined;

    if (kind === "code") {
      if (opensBlock) child = { indent: logical.indent, kind: "code", scope };
    } else if (word === "translate") {
      if (opensBlock) child = { indent: logical.indent, kind: "skip", scope };
    } else if (word === "label" && opensBlock) {
      const name = labelName(tokens);
      const full = name?.startsWith(".") ? `${globalLabel ?? ""}${name}` : name;
      if (name !== undefined && !name.startsWith(".") && !name.includes(".")) globalLabel = name;
      child = { indent: logical.indent, kind: "script", scope: full ?? scope };
    } else if (word === "screen" && opensBlock) {
      const name = tokens[1]?.kind === "word" ? tokens[1].text : "";
      child = { indent: logical.indent, kind: "code", scope: `screen ${name}` };
    } else if (word === "rpy" && wordAt(tokens, 1) === "monologue") {
      const value = wordAt(tokens, 2);
      if (value === "double" || value === "single" || value === "none") mode = value;
    } else if (kind === "menu" && first?.kind === "string" && opensBlock) {
      // A choice: "Text" (arguments) if condition:
      used = first.literal;
      const value = renpyValue(first.literal);
      if (value !== undefined) add(scope, value, first.literal.line, first.literal, { kind: "renpy" });
      child = { indent: logical.indent, kind: "script", scope };
    } else if (word !== undefined && STATEMENTS.has(word)) {
      if (opensBlock) {
        const script = SCRIPT_BLOCKS.has(word) && !(word === "init" && tokens.some((t) => isWord(t, "python")));
        child = { indent: logical.indent, kind: word === "menu" ? "menu" : script ? "script" : "code", scope };
      }
    } else if (!isPunct(first, "$")) {
      const what = sayWhat(tokens);
      if (what !== undefined) {
        used = what;
        addDialogue(what, scope, mode, add);
      }
      if (opensBlock) child = { indent: logical.indent, kind: "code", scope };
    }

    addMarked(tokens, used, scope, add);
    if (child !== undefined) stack.push(child);
  }
  return texts;
}

type Add = (scope: string | undefined, value: string, line: number, literal: Literal, encoding: TextEncoding) => void;

function addDialogue(literal: Literal, scope: string | undefined, mode: MonologueMode, add: Add): void {
  if (!literal.triple || literal.prefix !== "") {
    const value = renpyValue(literal);
    if (value !== undefined) add(scope, value, literal.line, literal, { kind: "renpy" });
    return;
  }
  const paragraphs = splitMonologue(literal.body, mode);
  const values = paragraphs.map((p) => p.value);
  paragraphs.forEach((paragraph, index) => {
    const encoding = { kind: "monologue", index, paragraphs: values, mode } as const;
    add(scope, paragraph.value, literal.line + paragraph.lineOffset, literal, encoding);
  });
}

/** The strings marked for translation: _("..."), __("...") and _p("..."), with a single literal. */
function addMarked(tokens: readonly Token[], used: Literal | undefined, scope: string | undefined, add: Add): void {
  tokens.forEach((token, i) => {
    const literal = tokens[i + 2];
    if (token.kind !== "word" || !TRANSLATABLE.has(token.text) || literal?.kind !== "string") return;
    if (!isPunct(tokens[i + 1], "(") || !isPunct(tokens[i + 3], ")") || isPunct(tokens[i - 1], ".")) return;
    if (literal.literal === used) return;
    const value = decodePythonString(literal.literal.prefix, literal.literal.body);
    if (value !== undefined) add(scope, value, literal.literal.line, literal.literal, { kind: "python" });
  });
}

/**
 * The dialogue string of a say statement, if the line is one:
 * [who] [attributes] [@ attributes] "what" [nointeract] [id x] [(arguments)] [with transition].
 * "who" is a name ("m", "m.friend") or a string ("Stranger").
 */
function sayWhat(tokens: readonly Token[]): Literal | undefined {
  const first = tokens[0];
  if (first === undefined) return undefined;
  const afterWho = first.kind === "string" || first.kind === "word" ? attributesEnd(tokens, 1) : undefined;
  const second = afterWho === undefined ? undefined : tokens[afterWho];
  if (second?.kind === "string") return isDialogueString(second.literal) ? second.literal : undefined;
  if (first.kind === "string") return isDialogueString(first.literal) ? first.literal : undefined;
  return undefined;
}

/** Index of the first token after the image attributes ("happy", "-sad", "@ angry") that start at `from`. */
function attributesEnd(tokens: readonly Token[], from: number): number {
  let i = from;
  let temporary = false;
  for (;;) {
    const token = tokens[i];
    if (isPunct(token, "-") && tokens[i + 1]?.kind === "word") i += 1;
    const current = tokens[i];
    if (current?.kind === "word" && ATTRIBUTE.test(current.text) && !STATEMENTS.has(current.text)) {
      i++;
    } else if (isPunct(current, "@") && !temporary) {
      temporary = true;
      i++;
    } else {
      return i;
    }
  }
}

/** Ren'Py dialogue strings take no prefix but "r". */
function isDialogueString(literal: Literal): boolean {
  return literal.prefix === "" || literal.prefix === "r";
}

/**
 * The value of a single Ren'Py string: dialogue, menu choice, or raw triple-quoted dialogue (never split).
 * Undefined for a prefix Ren'Py does not accept, and for triple-quoted choices.
 */
function renpyValue(literal: Literal): string | undefined {
  const raw = literal.prefix === "r";
  if (!isDialogueString(literal) || (literal.triple && !raw)) return undefined;
  return decodeRenpyString(literal.body, raw);
}

/** "label start(x=1):" → "start"; "label .evening:" → ".evening"; "label day1.night:" → "day1.night". */
function labelName(tokens: readonly Token[]): string | undefined {
  const second = tokens[1];
  if (second?.kind === "word") return second.text;
  const third = tokens[2];
  if (isPunct(second, ".") && third?.kind === "word") return `.${third.text}`;
  return undefined;
}

function wordAt(tokens: readonly Token[], index: number): string | undefined {
  const token = tokens[index];
  return token?.kind === "word" ? token.text : undefined;
}

function isWord(token: Token | undefined, text: string): boolean {
  return token?.kind === "word" && token.text === text;
}

function isPunct(token: Token | undefined, text: string): boolean {
  return token?.kind === "punct" && token.text === text;
}
