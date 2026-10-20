# tradforge

**English** · [Français](README.fr.md)

[![CI](https://github.com/ScottMichel/tradforge/actions/workflows/ci.yml/badge.svg)](https://github.com/ScottMichel/tradforge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Translate every text of a project — a game, a mod, an application — with an AI model running on your own computer, and make sure the result breaks nothing.**

The model translates. tradforge does everything else: it finds the texts in your files, drives the model, **checks every
single translation**, remembers what is done, survives interruptions, and writes clean translated files.

```text
$ tradforge translate
Translating 2,481 texts (96,320 characters) with mistral-small, 20 per batch...
  1,240/2,481 done, 1 failed, about 12 min left
  2,481/2,481 done, 1 failed
Done: 2,480 translated, 1 failed. Memory saved in .tradforge/memory.json.
```

## Why tradforge?

Asking a language model to translate thousands of lines works… until it doesn't. Models skip lines, answer with broken
JSON, translate variable names, or **invent placeholders** (`town` becoming `{town}`), and a single bad line can crash a
game. tradforge was born from translating a large game mod (see [the case study](#case-study)) and turns those lessons
into guarantees:

- **Strict validation** of every translation: placeholders kept and never invented (`{name}`, `%d`, `%1$s`), tags kept
  (`<b>`, `<LINE>`), same line breaks, same `*actions*`, same leading and trailing spaces, nothing left untranslated,
  no absurd length. A rejected translation is retried in smaller groups, then logged with its reason.
- **Translation memory**: each unique text is translated once, even if it appears 300 times. Run it again after an
  update: only the new texts go to the model, and a text whose punctuation merely changed reuses its old translation.
- **Consistent conversations**: texts are translated in the order of their files, a conversation is kept in one
  batch, and each batch comes with its neighbouring lines — and their translation — as context. The tone and the form
  of address stay the same from one line to the next.
- **Typography and glossary**: French typography is fixed automatically (non-breaking spaces before `; : ! ?`), and a
  translation that ignores the glossary is rejected.
- **Never lose work**: the memory is saved atomically after every batch. Ctrl+C, a crash or a power cut never corrupt
  it; the next run resumes where it stopped.
- **Human review protected**: a translation corrected by a person is never overwritten by the model. Export a CSV,
  review it in Excel or LibreOffice, import it back.
- **Safe output**: translated files keep the structure of the originals; tradforge refuses to replace a large output
  file with a much smaller one (the classic "ran it from the wrong folder" accident) unless you pass `--force`.
- **Local and free**: runs with [Ollama](https://ollama.com) on your machine. No API key, no cost per sentence, your
  texts never leave your computer.
- **Zero runtime dependencies**: only Node.js.

## Quick start

1. **Install [Node.js](https://nodejs.org) 22 or later and [Ollama](https://ollama.com)**, then download a model:

   ```sh
   ollama pull mistral-small
   ```

2. **Install tradforge.** It is not published on npm yet; until then, install it from the sources:

   ```sh
   git clone https://github.com/ScottMichel/tradforge.git
   cd tradforge
   npm ci && npm run build && npm link
   ```

3. **In the folder of your project:**

   ```sh
   tradforge init        # finds your text files, writes tradforge.config.json with every setting explained
   tradforge status      # how many texts, how many already translated
   tradforge translate   # translates what is missing (Ctrl+C to stop, run again to resume)
   tradforge build       # writes the translated files
   ```

Want to see it first? The [`examples/game`](examples/game) folder is a tiny game with a JSON interface and Lua
dialogues: `cd examples/game`, then `tradforge translate --dry-run`.

## Commands

| Command | What it does |
| --- | --- |
| `init [--from <lang>] [--to <lang>] [--force]` | Find the text files of the folder and create a commented `tradforge.config.json` |
| `status` | Texts in the project: translated, reviewed, failed, to translate, stale |
| `extract [--json]` | Find the texts to translate, without translating them |
| `diff` | New, removed and *slightly changed* texts since the last translation |
| `translate [--limit <n>] [--only <path>] [--retry] [--dry-run]` | Translate what the memory does not have yet |
| `build [--force]` | Write the translated files |
| `export [<file.csv>]` | Write a CSV to review or complete the translations |
| `import <file.csv> [--keep]` | Import reviewed or manual translations |

Every command accepts `--config <file>` and `--help`. Exit codes: `0` success, `1` error, `2` wrong command line,
`130` interrupted.

## Configuration

`tradforge init` writes this file with a comment on every setting (comments are allowed). Only the languages and the
sources are required.

```jsonc
{
  "sourceLanguage": "en",
  "targetLanguage": "fr",
  "workDir": ".tradforge",
  "sources": [
    {
      "format": "json",
      "include": ["locales/en/*.json"],
      "priority": 0,
      "context": "User interface",
      "group": "auto",
      "output": { "path": "locales/{lang}/{name}{ext}", "asciiOnly": false, "untranslated": "keep-source" }
    }
  ],
  "provider": { "type": "ollama", "model": "mistral-small", "host": "http://localhost:11434" },
  "translation": {
    "batchSize": 20,
    "instructions": "Video game texts. Keep a natural, casual tone.",
    "glossary": { "NPC": "PNJ" },
    "contextLines": 3,
    "typography": true,
    "reuse": true
  },
  "validation": { "placeholders": ["braces", "printf", "markup"], "glossary": true }
}
```

| Setting | Meaning | Default |
| --- | --- | --- |
| `workDir` | Where the translation memory lives. **Worth committing**: it holds all the work. | `.tradforge` |
| `sources[].format` | `json` or `lua` | required |
| `sources[].include` | Glob patterns, relative to the configuration file | required |
| `sources[].priority` | Lower is translated first (may be negative) | `0` |
| `sources[].context` | Tells the model how the texts are used | none |
| `sources[].group` | Which texts belong together and stay in one batch: `auto` (same JSON object; Lua lines with no blank line between them), `none`, `file`, or `{ "keyPattern": "^Dialog_(\\w+)_" }` (keys with the same first capture group) | `auto` |
| `sources[].output.path` | Where to write translations. `{dir}`, `{name}`, `{ext}` come from the source file, `{lang}` is the target language | `{dir}/{name}.{lang}{ext}` |
| `sources[].output.asciiOnly` | Escape accents (`é` → `\u00e9` in JSON, `\195\169` in Lua) for programs that read UTF-8 badly | `false` |
| `sources[].output.untranslated` | `keep-source` or `omit` (JSON keys only) | `keep-source` |
| `provider` | Ollama server and model | `mistral-small` on `localhost:11434` |
| `translation.batchSize` | Texts sent to the model in one request | `20` |
| `translation.instructions` | Tone, audience, conventions, sent with every batch | none |
| `translation.glossary` | Terms that must always be translated the same way (only the terms used in a batch are sent) | `{}` |
| `translation.contextLines` | Lines sent before and after each batch, with their translation when known, for context only (`0`: none) | `3` |
| `translation.typography` | Fix the typography of the target language (French: non-breaking spaces before `; : ! ?` and inside `« »`) | `true` |
| `translation.reuse` | Reuse the translation of a slightly changed text: copied when only the punctuation changed, shown to the model otherwise | `true` |
| `validation.placeholders` | Placeholder syntaxes to protect: `braces` `{name}`, `printf` `%s`, `markup` `<b>` | all three |
| `validation.glossary` | Reject a translation that does not use the glossary translation of a term found in the source | `true` |

> **VS Code:** to stop the editor from flagging the comments, add
> `"files.associations": { "tradforge.config.json": "jsonc" }` to your settings.

## Supported formats

| Format | Reads | Writes |
| --- | --- | --- |
| **JSON** | every string, nested objects and arrays (`menu.quit`, `tips.0`) | same structure, indentation and line endings; optional `\u` escapes |
| **Lua** | string literals of every kind (`"..."`, `'...'`, `[[...]]`, `[==[...]==]`, all escapes), skipping comments and **code-like strings** (`"idle"`, `"media/ui/icon.png"`, `"hp=%d"`) | strings replaced in place, the rest of the file kept byte for byte; optional `\ddd` escapes |

More formats are on the way: subtitles (`.srt`, `.vtt`), Project Zomboid, Ren'Py, RimWorld, Paradox, YAML, gettext
`.po`, Android, iOS, XLIFF, Markdown… See the [roadmap](#roadmap).

## How it works

```text
project files ──► find (include patterns; never the work folder nor previous translations)
              ──► read (one reader per format) ──► merge identical texts, keep the file order and the conversations
              ──► skip what the memory already has; reuse the translation of texts that only changed punctuation
              ──► batches, by priority, conversations kept whole
              ──► model (instructions + glossary + neighbouring lines + older versions, JSON answer enforced)
              ──► typography ──► validate ──► rejected? retry: a quarter of the batch, then alone, then log the failure
              ──► memory (atomic save after every batch)
              ──► build (one writer per format; everything planned and checked before anything is written)
```

The core (`src/core`) is pure logic: it never touches the disk or the network. Formats, engines, storage and the
command line are adapters plugged into it, which is why a new format or engine never changes the core. Details in
[docs/architecture.md](docs/architecture.md).

## Use it as a library

```ts
import { createProvider, extractSegments, loadMemory, parseConfig, saveMemory, translateSegments } from "tradforge";

const config = parseConfig({ sourceLanguage: "en", targetLanguage: "fr", sources: [{ format: "json", include: ["locales/en/*.json"] }] });
const segments = await extractSegments(".", config);
const memory = await loadMemory(".tradforge", config);
await translateSegments({ segments, memory, provider: createProvider(config.provider), config, save: () => saveMemory(".tradforge", memory) });
```

## Case study

tradforge is the general version of a script written to translate a large community mod of the game
*Project Zomboid* into French:

| | |
| --- | --- |
| Texts | about **98,000** sentences, ~5 million characters |
| Hardware | one AMD Radeon RX 7900 XT |
| Model | `mistral-small` with Ollama |
| Duration | about **17 hours** |
| Rejected by validation | **0.03 %**, fixed by hand |

No text of that mod, or of any other third-party project, is included in this repository: examples and tests use
texts written for tradforge.

## Limitations

- Two formats for now (JSON, Lua) and one engine (Ollama).
- Typography rules exist for French only (France and Canada) so far.
- The glossary check only looks for the expected term in the translation; it does not understand grammar.
- In JSON outputs, integer-like keys (`"1"`, `"42"`) come first: a JavaScript rule, the content is unchanged.

## Roadmap

1. **Game and subtitle formats**: Project Zomboid, Ren'Py, RimWorld, Paradox, `.srt`, `.vtt`.
2. **Engines and speed**: OpenAI-compatible APIs, Claude, Gemini, DeepL, parallel batches, cost estimates.
3. **Quality**: `tradforge compare` (models side by side), back-translation of suspicious lines.
4. **Application formats**: XLIFF, YAML, `.po`, Android, iOS, `.properties`, `.resx`, `.arb`, Markdown, HTML.
5. **Desktop application**: open a file or a folder, translate, review — no command line needed.
6. **Office documents**: `.docx`, `.odt`, `.pptx`, `.xlsx`.

## Contributing

Contributions are welcome, especially new formats: each one is a self-contained reader and writer. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Kazuugnii
