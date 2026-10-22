import { describe, expect, it } from "vitest";
import { findTokens } from "../../../../src/core/validation/placeholders.js";
import type { WriterInput } from "../../../../src/core/writer.js";
import { markdownTexts } from "../../../../src/formats/documents/markdown/blocks.js";
import { markdownReader } from "../../../../src/formats/documents/markdown/reader.js";
import { markdownWriter } from "../../../../src/formats/documents/markdown/writer.js";

const file = "docs/guide.md";

const document = `---
title: The Cold Forge
layout: post
date: 2024-01-01
---

# Getting started

Light the fire with **coal**, then
wait for the \`heat\` to rise.
See [the guide](https://example.org/guide "Guide").

- First step
- [ ] Second step,
  on two lines
  1. Nested item

> A quote that goes
> on two lines.

| Tool | Use |
| --- | :-: |
| Hammer | Shape the metal |

\`\`\`js
const notTranslated = "code";
\`\`\`

    indented code

<div class="note">Raw HTML stays.</div>

[guide]: https://example.org

Setext title
============

Line with a hard break\\
next line.

***
`;

describe("markdownTexts", () => {
  it("finds the texts of every block, and leaves code, HTML and link definitions out", () => {
    expect(markdownTexts(file, document).map((text) => text.value)).toEqual([
      "The Cold Forge",
      "Getting started",
      'Light the fire with **coal**, then wait for the `heat` to rise. See [the guide](https://example.org/guide "Guide").',
      "First step",
      "Second step, on two lines",
      "Nested item",
      "A quote that goes on two lines.",
      "Tool",
      "Use",
      "Hammer",
      "Shape the metal",
      "Setext title",
      "Line with a hard break\nnext line.",
    ]);
  });

  it("gives each text its line and the section it belongs to", () => {
    const texts = markdownTexts(file, document);
    expect(texts[2]).toMatchObject({ line: 9, section: 1 });
    expect(texts.at(-2)).toMatchObject({ line: 35, section: 2 });
    expect(texts[0]?.section).toBe(0);
  });
});

describe("markdown placeholders", () => {
  it("finds inline code and link destinations, which must come back untouched", () => {
    expect(
      findTokens('Use `heat` and ``a ` b``, see [x](https://a.org "t") or ![i](img.png) or [y][ref]', "markdown"),
    ).toEqual(["`heat`", "``a ` b``", '](https://a.org "t")', "](img.png)", "][ref]"]);
  });
});

describe("markdownReader", () => {
  it("reads the texts, grouped by section", () => {
    const occurrences = markdownReader.read({ file, content: document, priority: 0 });
    expect(occurrences[1]).toStrictEqual({
      source: "Getting started",
      location: { file, line: 7 },
      priority: 0,
      group: `${file}#1`,
    });
  });
});

describe("markdownWriter", () => {
  const translate = (source: string) => `[fr] ${source.replaceAll("\n", "\n[fr] ")}`;
  const write = (content: string, options: Partial<WriterInput["options"]> = {}) =>
    markdownWriter.write({
      file,
      content,
      translate,
      options: { asciiOnly: false, untranslated: "keep-source", ...options },
      languages: { source: "en", target: "fr" },
    });

  it("writes each translation in place, a paragraph on one line, everything else as it is", () => {
    const result = write(document).content;
    expect(result).toContain('---\ntitle: "[fr] The Cold Forge"\nlayout: post\ndate: 2024-01-01\n---');
    expect(result).toContain("# [fr] Getting started\n");
    expect(result).toContain(
      '[fr] Light the fire with **coal**, then wait for the `heat` to rise. See [the guide](https://example.org/guide "Guide").\n\n',
    );
    expect(result).toContain("- [fr] First step\n- [ ] [fr] Second step, on two lines\n  1. [fr] Nested item\n");
    expect(result).toContain("> [fr] A quote that goes on two lines.\n");
    expect(result).toContain("| [fr] Tool | [fr] Use |\n| --- | :-: |\n| [fr] Hammer | [fr] Shape the metal |\n");
    expect(result).toContain('```js\nconst notTranslated = "code";\n```\n\n    indented code\n');
    expect(result).toContain('<div class="note">Raw HTML stays.</div>\n\n[guide]: https://example.org\n');
    expect(result).toContain("[fr] Setext title\n============\n");
    expect(result).toContain("[fr] Line with a hard break\\\n[fr] next line.\n");
  });

  it("keeps the prefix of a quote after a hard break, and escapes a pipe in a table cell", () => {
    const quote = write("> One  \n> two\n").content;
    expect(quote).toBe("> [fr] One  \n> [fr] two\n");
    const table = markdownWriter.write({
      file,
      content: "| A |\n| - |\n| B |\n",
      translate: (source) => (source === "B" ? "B | C" : source),
      options: { asciiOnly: false, untranslated: "keep-source" },
      languages: { source: "en", target: "fr" },
    });
    expect(table.content).toBe("| A |\n| - |\n| B \\| C |\n");
  });

  it("keeps CRLF line ends", () => {
    expect(write("# Title\r\n\r\nOne\r\ntwo\r\n").content).toBe("# [fr] Title\r\n\r\n[fr] One two\r\n");
  });
});
