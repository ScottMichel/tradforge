import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Characters that are invisible or easy to mistake in code: control characters, unusual spaces, the byte order
 * mark, private use characters. In the code they must be written as escapes, e.g. "\u{a0}", so that a reader sees them.
 */
const INVISIBLE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: finding control characters is the purpose of this check.
  /[\u{0}-\u{8}\u{b}\u{c}\u{e}-\u{1f}\u{7f}-\u{a0}\u{ad}\u{2000}-\u{200f}\u{2028}-\u{202f}\u{205f}-\u{206f}\u{feff}\u{e000}-\u{f8ff}\u{fff0}-\u{ffff}]/u;

const root = path.join(import.meta.dirname, "..");

describe("code hygiene", () => {
  it("has no invisible character in the code, the tests or the examples", async () => {
    const problems: string[] = [];
    const patterns = ["src/**/*.ts", "tests/**/*.ts", "examples/**/*.{json,lua}", "docs/**/*.md"];
    const documents = ["README.md", "README.fr.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "CHANGELOG.md"];
    for await (const file of glob([...patterns, ...documents], { cwd: root })) {
      const lines = (await readFile(path.join(root, file), "utf8")).split("\n");
      lines.forEach((line, index) => {
        const match = INVISIBLE.exec(line);
        if (match !== null) {
          const code = match[0].codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0");
          problems.push(`${file}:${index + 1}: U+${code}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });
});
