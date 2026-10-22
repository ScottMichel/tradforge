/**
 * Changes one value of a JSON text with comments (tradforge.config.json) and leaves everything else as it was:
 * comments, blank lines, the order and the layout of the other properties. Rewriting the whole file with
 * JSON.stringify would lose the comments that explain each setting.
 */

interface ObjectNode {
  readonly kind: "object";
  readonly start: number;
  /** Just after the closing brace. */
  readonly end: number;
  readonly properties: readonly PropertyNode[];
}

interface OtherNode {
  readonly kind: "other";
  readonly start: number;
  readonly end: number;
}

type ValueNode = ObjectNode | OtherNode;

interface PropertyNode {
  readonly key: string;
  /** Where the key starts. */
  readonly start: number;
  readonly value: ValueNode;
}

/**
 * The text with the value at `path` replaced, added (with the missing objects on the way) or, for undefined, removed.
 * New values are written as indented JSON, aligned with their neighbours.
 */
export function editJsonc(text: string, path: readonly string[], value: unknown): string {
  const root = new Parser(text).document();
  if (root.kind !== "object") throw new Error("The configuration must be a JSON object");

  let parent = root;
  for (const [depth, key] of path.entries()) {
    const property = parent.properties.find((candidate) => candidate.key === key);
    const last = depth === path.length - 1;
    if (property === undefined) {
      if (value === undefined) return text;
      return insert(text, parent, key, nest(path.slice(depth + 1), value));
    }
    if (last) {
      return value === undefined ? remove(text, parent, property) : replace(text, property, value);
    }
    if (property.value.kind !== "object") throw new Error(`${path.slice(0, depth + 1).join(".")} is not an object`);
    parent = property.value;
  }
  throw new Error("The path is empty");
}

/** { a: { b: value } } for the path [a, b]. */
function nest(path: readonly string[], value: unknown): unknown {
  return path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), value);
}

function replace(text: string, property: PropertyNode, value: unknown): string {
  const { start, end } = property.value;
  return text.slice(0, start) + format(value, indentAt(text, property.start)) + text.slice(end);
}

function insert(text: string, object: ObjectNode, key: string, value: unknown): string {
  const last = object.properties.at(-1);
  if (last !== undefined) {
    const indent = indentAt(text, last.start);
    const added = `,\n${indent}${JSON.stringify(key)}: ${format(value, indent)}`;
    return text.slice(0, last.value.end) + added + text.slice(last.value.end);
  }
  const outer = indentAt(text, object.start);
  const inner = `${outer}  `;
  const added = `{\n${inner}${JSON.stringify(key)}: ${format(value, inner)}\n${outer}}`;
  return text.slice(0, object.start) + added + text.slice(object.end);
}

function remove(text: string, object: ObjectNode, property: PropertyNode): string {
  const index = object.properties.indexOf(property);
  const next = object.properties[index + 1];
  const previous = object.properties[index - 1];
  if (next !== undefined) {
    // From the start of its line (when it starts one) to after its comma, with the rest of that line.
    const lineStart = text.lastIndexOf("\n", property.start - 1) + 1;
    const ownLine = text.slice(lineStart, property.start).trim() === "";
    const comma = text.indexOf(",", property.value.end) + 1;
    if (!ownLine) return text.slice(0, property.start) + text.slice(skipSpaces(text, comma));
    const lineEnd = text.indexOf("\n", comma);
    const restOfLine = text.slice(comma, lineEnd === -1 ? text.length : lineEnd).trim();
    const end = restOfLine === "" && lineEnd !== -1 ? lineEnd + 1 : comma;
    return text.slice(0, lineStart) + text.slice(end);
  }
  if (previous !== undefined) {
    // The last property: the comma after the previous one goes too.
    const comma = text.indexOf(",", previous.value.end);
    return text.slice(0, comma) + text.slice(property.value.end);
  }
  return `${text.slice(0, object.start)}{}${text.slice(object.end)}`;
}

function format(value: unknown, indent: string): string {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) throw new Error("This value cannot be written as JSON");
  return json.replaceAll("\n", `\n${indent}`);
}

/** The spaces at the start of the line that holds this position. */
function indentAt(text: string, position: number): string {
  const lineStart = text.lastIndexOf("\n", position - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

function skipSpaces(text: string, position: number): number {
  let pos = position;
  while (text[pos] === " " || text[pos] === "\t") pos++;
  return pos;
}

/** Reads JSON with comments, keeping the position of every object and value. */
class Parser {
  private pos = 0;

  constructor(private readonly text: string) {}

  document(): ValueNode {
    this.skip();
    const value = this.value();
    this.skip();
    if (this.pos < this.text.length) this.fail("unexpected text after the end");
    return value;
  }

  private value(): ValueNode {
    const char = this.text[this.pos];
    if (char === "{") return this.object();
    const start = this.pos;
    if (char === "[") this.array();
    else if (char === '"') this.string();
    else this.literal();
    return { kind: "other", start, end: this.pos };
  }

  private object(): ObjectNode {
    const start = this.pos;
    this.pos++; // {
    const properties: PropertyNode[] = [];
    this.skip();
    if (this.text[this.pos] === "}") {
      this.pos++;
      return { kind: "object", start, end: this.pos, properties };
    }
    for (;;) {
      this.skip();
      const keyStart = this.pos;
      if (this.text[this.pos] !== '"') this.fail("expected a property name");
      const key = this.string();
      this.skip();
      if (this.text[this.pos] !== ":") this.fail('expected ":"');
      this.pos++;
      this.skip();
      properties.push({ key, start: keyStart, value: this.value() });
      this.skip();
      const char = this.text[this.pos];
      this.pos++;
      if (char === "}") return { kind: "object", start, end: this.pos, properties };
      if (char !== ",") this.fail('expected "," or "}"');
    }
  }

  private array(): void {
    this.pos++; // [
    this.skip();
    if (this.text[this.pos] === "]") {
      this.pos++;
      return;
    }
    for (;;) {
      this.skip();
      this.value();
      this.skip();
      const char = this.text[this.pos];
      this.pos++;
      if (char === "]") return;
      if (char !== ",") this.fail('expected "," or "]"');
    }
  }

  /** The decoded string; the position moves after its closing quote. */
  private string(): string {
    const start = this.pos;
    this.pos++;
    while (this.pos < this.text.length && this.text[this.pos] !== '"') {
      this.pos += this.text[this.pos] === "\\" ? 2 : 1;
    }
    if (this.pos >= this.text.length) this.fail("unterminated string");
    this.pos++;
    return JSON.parse(this.text.slice(start, this.pos)) as string;
  }

  private literal(): void {
    const match = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(this.text.slice(this.pos));
    if (match === null) this.fail("expected a value");
    this.pos += match[0].length;
  }

  /** Skips spaces, // comments and /* *\/ comments. */
  private skip(): void {
    for (;;) {
      while (/\s/.test(this.text[this.pos] ?? "")) this.pos++;
      if (this.text.startsWith("//", this.pos)) {
        const end = this.text.indexOf("\n", this.pos);
        this.pos = end === -1 ? this.text.length : end;
      } else if (this.text.startsWith("/*", this.pos)) {
        const end = this.text.indexOf("*/", this.pos + 2);
        if (end === -1) this.fail("unterminated comment");
        this.pos = end + 2;
      } else {
        return;
      }
    }
  }

  private fail(message: string): never {
    throw new Error(`Invalid JSON at position ${this.pos}: ${message}`);
  }
}
