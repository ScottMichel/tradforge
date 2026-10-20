import { findTokens, type PlaceholderSyntax } from "./validation/placeholders.js";

/** A text whose placeholders and tags were replaced with numbered tags, and what they stood for. */
export interface Protected {
  readonly text: string;
  /** tokens[n] is the placeholder that <x id="n"/> stands for. */
  readonly tokens: readonly string[];
}

/** The translation lost, repeated or invented a protected tag. */
export class ProtectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectionError";
  }
}

const TAG = /<x id="(\d+)"\s*\/>/g;

/**
 * Replaces placeholders and tags with <x id="n"/>, a form that engines such as DeepL can be told never to touch.
 * Markup goes first, so that the inserted tags are never taken for markup themselves.
 */
export function protectPlaceholders(text: string, syntaxes: readonly PlaceholderSyntax[]): Protected {
  const ordered = [...syntaxes].sort((a, b) => Number(b === "markup") - Number(a === "markup"));
  const tokens: string[] = [];
  let result = text;
  for (const syntax of ordered) {
    for (const token of new Set(findTokens(result, syntax))) {
      result = result.replaceAll(token, () => {
        tokens.push(token);
        return `<x id="${tokens.length - 1}"/>`;
      });
    }
  }
  return { text: result, tokens };
}

/** Puts the placeholders back. Every tag must come back exactly once: otherwise a ProtectionError is thrown. */
export function restorePlaceholders(text: string, tokens: readonly string[]): string {
  const seen = new Set<number>();
  const restored = text.replace(TAG, (tag, id: string) => {
    const index = Number(id);
    const token = tokens[index];
    if (token === undefined) throw new ProtectionError(`unknown protected tag ${tag}`);
    if (seen.has(index)) throw new ProtectionError(`protected tag repeated: ${tag} (${token})`);
    seen.add(index);
    return token;
  });
  const missing = tokens.filter((_, index) => !seen.has(index));
  if (missing.length > 0)
    throw new ProtectionError(`protected tags missing from the translation: ${missing.join(", ")}`);
  return restored;
}
