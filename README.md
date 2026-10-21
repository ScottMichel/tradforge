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
  texts never leave your computer. Or use any OpenAI-compatible API (OpenAI, Mistral, OpenRouter, Groq...) when you
  prefer.
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
| `translate [--limit <n>] [--only <path>] [--retry] [--dry-run]` | Translate what the memory does not have yet; `--dry-run` sends nothing and estimates the tokens and the cost |
| `compare --engines <type[:model],...> [--sample <n>] [<file.csv>]` | Translate a sample with several engines, side by side, to choose one; the memory is not changed |
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
| `sources[].format` | `json`, `lua`, `srt`, `vtt`, `renpy`, `zomboid-txt`, `paradox-yml` or `rimworld-xml` (see [Supported formats](#supported-formats)) | required |
| `sources[].include` | Glob patterns, relative to the configuration file | required |
| `sources[].priority` | Lower is translated first (may be negative) | `0` |
| `sources[].context` | Tells the model how the texts are used | none |
| `sources[].group` | Which texts belong together and stay in one batch: `auto` (same JSON object; Lua lines with no blank line between them), `none`, `file`, or `{ "keyPattern": "^Dialog_(\\w+)_" }` (keys with the same first capture group) | `auto` |
| `sources[].encoding` | Encoding of the source files: `auto` (byte order mark, then valid UTF-8, then `windows-1252`), `utf-8`, `windows-1251`... | `auto` |
| `sources[].output.path` | Where to write translations. `{dir}`, `{name}`, `{ext}` come from the source file; `{stem}` is the name without its language suffix (`UI_EN` → `UI`); `{lang}` is the target language, `{LANG}` the same in capitals, `{language}` its English name (`french`) | `{dir}/{name}.{lang}{ext}` |
| `sources[].output.asciiOnly` | Escape accents (`é` → `\u00e9` in JSON, `\195\169` in Lua) for programs that read UTF-8 badly | `false` |
| `sources[].output.untranslated` | `keep-source` or `omit` (JSON keys only) | `keep-source` |
| `sources[].output.encoding` | Encoding of the translated files: `utf-8`, `utf-8-bom` (required by Paradox games), `utf-16le`, `windows-1252`, `windows-1251`... A character the encoding cannot hold is an error, never a `?` | `utf-8` |
| `provider` | The engine and its model: see [Engines](#engines) | Ollama, `mistral-small` on `localhost:11434` |
| `translation.batchSize` | Texts sent to the model in one request | `20` |
| `translation.concurrency` | Batches sent at the same time. Keep `1` for a local model (the graphics card is already busy); try `4` to `8` with a remote API, within its rate limits. Batches sent together see fewer translated neighbours as context | `1` |
| `translation.instructions` | Tone, audience, conventions, sent with every batch | none |
| `translation.glossary` | Terms that must always be translated the same way (only the terms used in a batch are sent) | `{}` |
| `translation.contextLines` | Lines sent before and after each batch, with their translation when known, for context only (`0`: none) | `3` |
| `translation.typography` | Fix the typography of the target language (French: non-breaking spaces before `; : ! ?` and inside `« »`) | `true` |
| `translation.reuse` | Reuse the translation of a slightly changed text: copied when only the punctuation changed, shown to the model otherwise | `true` |
| `validation.placeholders` | Placeholder syntaxes to protect: `braces` `{name}`, `printf` `%s`, `positional` `%1`, `bbcode` `[img=x]`, `ass` `{\an8}`, `timestamp` `<00:00:01.500>`, `markup` `<b>`. The `paradox`, `renpy` and `rimworld` syntaxes come automatically with their format | all but the format ones |
| `validation.glossary` | Reject a translation that does not use the glossary translation of a term found in the source | `true` |

> **VS Code:** to stop the editor from flagging the comments, add
> `"files.associations": { "tradforge.config.json": "jsonc" }` to your settings.

## Supported formats

### File formats

| Format | Reads | Writes |
| --- | --- | --- |
| **JSON** `.json` (`json`) | every string, nested objects and arrays (`menu.quit`, `tips.0`); also Project Zomboid Build 42 translations | same structure, indentation and line endings; optional `\u` escapes |
| **Lua** `.lua` (`lua`) | string literals of every kind (`"..."`, `'...'`, `[[...]]`, `[==[...]==]`, all escapes), skipping comments and **code-like strings** (`"idle"`, `"media/ui/icon.png"`, `"hp=%d"`) | strings replaced in place, the rest of the file kept byte for byte; optional `\ddd` escapes |
| **SubRip** `.srt` (`srt`), **WebVTT** `.vtt` (`vtt`) | one text per cue, cues less than 2 s apart kept together as a scene; tags, `{\an8}` codes, NOTE/STYLE blocks | texts replaced in place, numbers and timings untouched; `movie.en.srt` → `movie.fr.srt` |

### Engine and game dialects

These are real file types with rules of their own: a Paradox `.yml` file is not valid YAML, a Project Zomboid `.txt`
file is a Lua-like table, a RimWorld `.xml` file follows a fixed schema. tradforge reads them the way the engine does.

| Format | File type | Reads | Writes |
| --- | --- | --- | --- |
| **Ren'Py scripts** (`renpy`) | `.rpy` | dialogue, narration, menu choices, `_()` strings; one group per label | translated copies of the scripts, written in a separate folder; text tags `{b}` and interpolations `[name]` protected |
| **Project Zomboid translation tables**, Build 41 (`zomboid-txt`) | `.txt` | `Translate/EN/UI_EN.txt`, read the way the game reads them (texts between the first and last quote, `..` continuations, broken lines skipped) | `Translate/FR/UI_FR.txt`, table renamed, the game's language codes (`PTBR`, `CH`...), legacy encodings |
| **Paradox localisation** (`paradox-yml`) | `.yml`, Paradox dialect | `localisation/english/*_l_english.yml`: Crusader Kings, Europa Universalis, Hearts of Iron, Stellaris, Victoria | `l_french:` header, game language names (`braz_por`), UTF-8 with BOM; `$VAR$`, `§Y§!`, `£icon£`, `[Scope.Function]` protected |
| **RimWorld language data** (`rimworld-xml`) | `.xml`, `<LanguageData>` root | `Languages/English/Keyed/` and `DefInjected/`, `<li>` lists, literal `\n` | `Languages/French/...`, XML escaped correctly; grammar symbols `[PAWN_nameDef]` and rule heads protected |

`tradforge init` recognises all of them in a folder (by extension, or by path for the dialects whose extension is
generic) and proposes the right output paths. More formats are on the way: YAML, gettext `.po`, Android, iOS, XLIFF, Markdown… See the
[roadmap](#roadmap).

## Engines

| `provider.type` | Settings | For |
| --- | --- | --- |
| `ollama` (default) | `model` (`mistral-small`), `host` (`http://localhost:11434`) | a local model, free, offline |
| `openai-compatible` | `model` (required), `baseUrl` (`https://api.openai.com/v1`), `apiKeyEnv` (`OPENAI_API_KEY`), `responseFormat` (`json-schema`) | OpenAI, Mistral, OpenRouter, Groq, and local servers such as LM Studio or vLLM |
| `anthropic` | `model` (required, e.g. `claude-haiku-5-5`), `baseUrl` (`https://api.anthropic.com/v1`), `apiKeyEnv` (`ANTHROPIC_API_KEY`) | Claude |
| `gemini` | `model` (required, e.g. `gemini-flash-latest`, which follows the current Flash model), `baseUrl` (`https://generativelanguage.googleapis.com/v1beta`), `apiKeyEnv` (`GEMINI_API_KEY`) | Gemini, with a free tier for trying it out |
| `deepl` | `model` (`deepl`, or a DeepL model type such as `quality_optimized`), `formality` (`default`; `prefer_less` for an informal "you"), `apiKeyEnv` (`DEEPL_API_KEY`), `baseUrl` (guessed from the key: free keys end with `:fx`) | DeepL, a translation engine rather than a language model |

```jsonc
"provider": { "type": "openai-compatible", "model": "mistral-small-latest", "baseUrl": "https://api.mistral.ai/v1", "apiKeyEnv": "MISTRAL_API_KEY" }
```

The API key is read from the environment variable named by `apiKeyEnv` (`export MISTRAL_API_KEY=...`, or
`$env:MISTRAL_API_KEY = "..."` in PowerShell). tradforge refuses a key written in the configuration file, since that
file is usually committed, and never shows the key in its messages. Local servers need no key.

`responseFormat` tells how the answer is constrained: `json-schema` (the answer must follow tradforge's schema),
`json-object` (any JSON) or `none` (the instructions alone), for servers that refuse schemas.

`translate --dry-run` estimates the tokens a run sends and receives, measured on the real prompt (instructions,
glossary and context lines are paid for with every batch). Add `"pricing": { "inputPerMillion": 0.4,
"outputPerMillion": 1.6 }` to the provider, copied from the price list of your API, to get the cost: tradforge has no
built-in prices, since they change too often. On the example project, the estimate was 11 % above the real count for
what is sent, and exact for what is received; retries are not included.

DeepL is not a language model: it gets the texts, never a prompt. tradforge replaces placeholders and tags with
`<x id="0"/>` before sending them and puts them back after; instructions, contexts and neighbouring lines go in
DeepL's `context` parameter (not billed); the glossary becomes a DeepL glossary, named after its content and reused
from one run to the next. DeepL bills characters, so `pricing` is `{ "perMillionCharacters": 25 }`.

To choose an engine, compare them on your own texts:

```sh
tradforge compare --engines "ollama,gemini:gemini-flash-latest,deepl" --sample 30
```

Each engine translates the same sample (texts spread over the project, a quarter of them with placeholders, always
the same ones), with the real validation, and the project memory is not changed. You get a table (translated,
failed, time, cost of the rest of the project), the texts on which the engines disagree side by side, and every
translation in `.tradforge/compare.csv`. An engine of the project's type keeps its settings; an Ollama model name
keeps its colon (`ollama:qwen3:8b`).

When an API asks to slow down (HTTP 429), every batch pauses for the delay the server gives (or 1 s, 2 s, 4 s...),
then the same batch is sent again: a rate limit is never counted as a failure. After 6 waits in a row, tradforge stops
and advises a lower `translation.concurrency`. A used-up quota stops at once. An engine that does not answer at all,
3 times in a row, is taken as down: smaller batches would not help.

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

- Engines: Ollama, OpenAI-compatible APIs, Claude, Gemini and DeepL. Real runs were made with Ollama and Gemini;
  the others are tested against recorded answers of their APIs.
- Ren'Py games get translated copies of their scripts, not a `game/tl/` translation the player can switch to.
- RimWorld language folders are named after the English language name (`French`): rename them if your mod uses
  another name.
- Typography rules exist for French only (France and Canada) so far.
- The glossary check only looks for the expected term in the translation; it does not understand grammar.
- In JSON outputs, integer-like keys (`"1"`, `"42"`) come first: a JavaScript rule, the content is unchanged.

## Roadmap

1. **Quality**: back-translation of suspicious lines.
2. **Application formats**: XLIFF, YAML, `.po`, Android, iOS, `.properties`, `.resx`, `.arb`, Markdown, HTML.
3. **Desktop application**: open a file or a folder, translate, review — no command line needed.
4. **Office documents**: `.docx`, `.odt`, `.pptx`, `.xlsx`.

## Contributing

Contributions are welcome, especially new formats: each one is a self-contained reader and writer. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Kazuugnii
