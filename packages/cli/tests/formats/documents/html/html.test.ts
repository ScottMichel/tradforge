import { describe, expect, it } from "vitest";
import type { WriterInput } from "../../../../src/core/writer.js";
import { decodeEntities, htmlTexts } from "../../../../src/formats/documents/html/document.js";
import { htmlReader } from "../../../../src/formats/documents/html/reader.js";
import { htmlWriter } from "../../../../src/formats/documents/html/writer.js";

const file = "site/index.html";

/** A page written for the tests. */
const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>The Cold Forge</title>
  <meta name="description" content="A game about smiths &amp; fire">
  <style>p { color: red; }</style>
  <script>const text = "<p>not a text</p>";</script>
</head>
<body>
  <!-- a comment -->
  <h1>Welcome to the <em>forge</em></h1>
  <p class=intro>Light the fire with <strong>coal</strong>,<br>
     then wait&nbsp;&hellip; &copy; 2024</p>
  <ul>
    <li>First step
    <li>Second <a href="/steps#2" title="Second step">step</a>
  </ul>
  <p><img src="anvil.png" alt="An anvil"></p>
  <input placeholder="Your name">
  <pre>  code   stays  </pre>
  <p>Fish &amp; chips &lt;tonight&gt; &unknown;</p>
</body>
</html>
`;

describe("htmlTexts", () => {
  it("finds the texts between block tags, inline tags kept, and the translatable attributes", () => {
    expect(htmlTexts(file, page).map((text) => [text.kind, text.value])).toEqual([
      ["element", "The Cold Forge"],
      ["attribute", "A game about smiths & fire"],
      ["element", "Welcome to the <em>forge</em>"],
      ["element", "Light the fire with <strong>coal</strong>,<br> then wait\u{a0}\u{2026} \u{a9} 2024"],
      ["element", "First step"],
      ["element", 'Second <a href="/steps#2" title="Second step">step</a>'],
      ["attribute", "An anvil"],
      ["attribute", "Your name"],
      ["element", "Fish & chips <tonight> &unknown;"],
    ]);
  });

  it("gives the line of each text and the inline tags of its source", () => {
    const texts = htmlTexts(file, page);
    expect(texts[2]).toMatchObject({ line: 12, tags: ["<em>", "</em>"] });
    expect(texts[6]?.line).toBe(19);
  });

  it("decodes named and numeric character references, and keeps the unknown ones", () => {
    expect(decodeEntities("&eacute;t&#233; &#x2014; &amp;amp; &bogus; & alone")).toBe("été — &amp; &bogus; & alone");
  });
});

describe("htmlReader", () => {
  it("reads every text with its line", () => {
    const [title] = htmlReader.read({ file, content: page, priority: 0 });
    expect(title).toStrictEqual({ source: "The Cold Forge", location: { file, line: 5 }, priority: 0 });
  });
});

describe("htmlWriter", () => {
  const write = (content: string, options: Partial<WriterInput["options"]> = {}) =>
    htmlWriter.write({
      file,
      content,
      translate: (source) => `[fr] ${source}`,
      options: { asciiOnly: false, untranslated: "keep-source", ...options },
      languages: { source: "en", target: "fr" },
    });

  it("writes each translation in place, escaped, and names the language of the page", () => {
    const result = write(page).content;
    expect(result).toContain('<html lang="fr">');
    expect(result).toContain("<title>[fr] The Cold Forge</title>");
    expect(result).toContain('content="[fr] A game about smiths &amp; fire"');
    expect(result).toContain("<h1>[fr] Welcome to the <em>forge</em></h1>");
    expect(result).toContain(
      "<p class=intro>[fr] Light the fire with <strong>coal</strong>,<br> then wait\u{a0}\u{2026} \u{a9} 2024</p>",
    );
    expect(result).toContain("<li>[fr] First step\n");
    expect(result).toContain('alt="[fr] An anvil"');
    expect(result).toContain('placeholder="[fr] Your name"');
    expect(result).toContain("<p>[fr] Fish &amp; chips &lt;tonight&gt; &unknown;</p>");
    expect(result).toContain('<script>const text = "<p>not a text</p>";</script>');
    expect(result).toContain("<pre>  code   stays  </pre>");
  });

  it("writes characters outside ASCII as references with asciiOnly", () => {
    expect(write("<p>Été</p>", { asciiOnly: true }).content).toBe("<p>[fr] &#201;t&#233;</p>");
  });
});
