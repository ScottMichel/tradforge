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
| `verify [--all] [--only <path>] [--limit <n>] [--judge <type[:model]>]` | Translate suspicious translations back and have a language model judge whether the meaning is kept |
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
| `sources[].format` | `json`, `yaml`, `markdown`, `html`, `docx`, `pptx`, `lua`, `po`, `xliff`, `android`, `ios-strings`, `xcstrings`, `properties`, `resx`, `arb`, `srt`, `vtt`, `renpy`, `zomboid-txt`, `paradox-yml` or `rimworld-xml` (see [Supported formats](#supported-formats)) | required |
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
| `validation.placeholders` | Placeholder syntaxes to protect: `braces` `{name}`, `printf` `%s`, `positional` `%1`, `bbcode` `[img=x]`, `ass` `{\an8}`, `timestamp` `<00:00:01.500>`, `markup` `<b>`. The `paradox`, `renpy`, `rimworld` and `markdown` syntaxes come automatically with their format | all but the format ones |
| `validation.glossary` | Reject a translation that does not use the glossary translation of a term found in the source | `true` |

> **VS Code:** to stop the editor from flagging the comments, add
> `"files.associations": { "tradforge.config.json": "jsonc" }` to your settings.

## Supported formats

### File formats

| Format | Reads | Writes |
| --- | --- | --- |
| **JSON** `.json` (`json`) | every string, nested objects and arrays (`menu.quit`, `tips.0`); also Project Zomboid Build 42 translations | same structure, indentation and line endings; optional `\u` escapes |
| **YAML** `.yml`, `.yaml` (`yaml`) | every string, nested mappings and lists (`en.menu.quit`, `en.days.0`), all string styles (plain, quoted, `\|` and `>` blocks); `true`, `no`, numbers and dates left out, as YAML 1.1 reads them | values replaced in place in their own style when it is safe, in double quotes otherwise; Rails' `en:` root renamed `fr:`; comments and layout kept |
| **Lua** `.lua` (`lua`) | string literals of every kind (`"..."`, `'...'`, `[[...]]`, `[==[...]==]`, all escapes), skipping comments and **code-like strings** (`"idle"`, `"media/ui/icon.png"`, `"hp=%d"`) | strings replaced in place, the rest of the file kept byte for byte; optional `\ddd` escapes |
| **gettext** `.po`, `.pot` (`po`) | every `msgid` and `msgid_plural`; `msgctxt` and `#.` notes sent as context; obsolete `#~` entries skipped | `msgstr` filled in, comments and references kept byte for byte; plural forms of the target language (`msgstr[0..n]`), `Language` and `Plural-Forms` headers, UTF-8; `fuzzy` dropped from translated entries; `forge.pot` → `fr.po` |
| **XLIFF** 1.2 and 2.x `.xlf`, `.xliff` (`xliff`) | the source of every unit (and every segment in XLIFF 2), except `translate="no"`; inline elements (`<x/>`, `<g>`, `<ph>`, `<pc>`) kept in the text and checked; notes sent as context | targets written or added after their source, `target-language`/`trgLang` set, the rest kept byte for byte; Angular's `messages.xlf` → `messages.fr.xlf` |
| **Android string resources** (`android`) | `res/values/strings.xml`: `<string>`, `<string-array>` items and `<plurals>` quantities, read as Android reads them (escapes, quotes, spaces); `translatable="false"` skipped; `<xliff:g>` and `<b>` kept and checked | `res/values-fr/`, `values-pt-rBR/`; escaped for Android (`\'`, `\@`...), plurals with the quantities of the target language (CLDR), non-translatable resources left out |
| **Apple strings** `.strings` (`ios-strings`) | `en.lproj/` or `Base.lproj/`: every value, the comment above it sent as context; all escapes (`\"`, `\n`, `\U00E9`) | `fr.lproj/`, values replaced in place, comments kept; `%@` and `%ld` checked |
| **Xcode string catalogs** `.xcstrings` (`xcstrings`) | the source language of every string (the key when it has no value), plural variations, the comment as context; `shouldTranslate: false` respected | **the catalog itself**: the target language added or updated, other languages untouched, translations made in Xcode never removed; plural categories of the target language; Xcode's layout, so that a diff shows only the new lines |
| **Java resource bundles** `.properties` (`properties`) | `messages.properties` or `messages_en.properties`: every value, the comment above it as context; `=`, `:` and space separators, `\` continuations, `\uXXXX`; the doubled apostrophes of MessageFormat texts (`Don''t {0}`) given as one | `messages_fr.properties`, values in place on one line, apostrophes doubled again when the text has `{0}` arguments; `asciiOnly` for Java 8 |
| **.NET resources** `.resx` (`resx`) | every string `<data>` (not files, objects or Windows Forms designer data), its `<comment>` as context | `Strings.fr.resx`, values in place, XML escaped |
| **Flutter** `.arb` (`arb`) | every message, its `@key` description as context | `app_fr.arb` (`app_pt_BR.arb`), `@@locale` renamed, metadata kept |
| **Markdown** `.md` (`markdown`) | headings, paragraphs (wrapped lines joined), list items, quotes, table cells, and the `title`/`description` of a YAML front matter; code blocks, HTML blocks and link definitions left out; one group per section | `README.fr.md`, `docs/{lang}/`; texts in place, a paragraph on one line; `` `code` `` and link destinations `](url)` must come back untouched |
| **HTML** `.html` (`html`) | the text between block tags, inline tags (`<a>`, `<strong>`, `<br>`) kept and checked; `alt`, `title`, `placeholder`, `aria-label`, `<title>` and description meta tags; read as browsers do (unclosed `<p>`, `&nbsp;`); scripts, styles and `<pre>` left out | `fr/index.html` or `about.fr.html`; texts in place, `<html lang>` set, everything else byte for byte |
| **Word** `.docx` (`docx`) | every paragraph of the body, tables, headers, footers and notes, as one text: other formats as tags (`<g1>bold</g1>`), tabs, pictures and fields as `<x1/>`; the paragraph style as context | `manual.fr.docx`: the runs of each paragraph rebuilt in the order of the translation, the language set for spelling, every other part of the archive copied byte for byte |
| **PowerPoint** `.pptx` (`pptx`) | every paragraph of the slides (text boxes, shapes, tables), then the speaker notes, as in Word; one group per slide; layouts and masters left out | `talk.fr.pptx`, as for Word |
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
generic) and proposes the right output paths. See the [roadmap](#roadmap) for what comes next.

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
from one run to the next; when the account holds no more glossaries (one on a free account), the older ones
that tradforge made for the same language pair are deleted to make room. DeepL bills characters, so `pricing` is `{ "perMillionCharacters": 25 }`.

To choose an engine, compare them on your own texts:

```sh
tradforge compare --engines "ollama,gemini:gemini-flash-latest,deepl" --sample 30
```

Each engine translates the same sample (texts spread over the project, a quarter of them with placeholders, always
the same ones), with the real validation, and the project memory is not changed. You get a table (translated,
failed, time, cost of the rest of the project), the texts on which the engines disagree side by side, and every
translation in `.tradforge/compare.csv`. An engine of the project's type keeps its settings; an Ollama model name
keeps its colon (`ollama:qwen3:8b`).

Validation catches broken placeholders and markup, not a wrong meaning. `tradforge verify` looks for translations
that deserve a second look: numbers that changed, a negation that disappeared, a length out of proportion, a text
left as it was. It translates them back into the source language with the project engine, then a language model
compares the original and the back-translation and gives a verdict: `same`, `nuance` or `different`, with a
note. `--all` checks every machine translation; human translations are never checked. Verdicts are kept in the
memory until the translation changes, and `export` adds them to the CSV (`check`, `back_translation`,
`check_note`), so that a review starts with the real problems. DeepL can translate back but not judge: add
`--judge ollama` (or any language model).

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

- Engines: Ollama, OpenAI-compatible APIs, Claude, Gemini and DeepL. Real runs were made with Ollama (also through its
  OpenAI-compatible endpoint), Gemini and DeepL; Claude is tested against recorded answers of its API.
- Ren'Py games get translated copies of their scripts, not a `game/tl/` translation the player can switch to.
- RimWorld language folders are named after the English language name (`French`): rename them if your mod uses
  another name.
- gettext: entries that differ only by their `msgctxt` get the same translation. Languages with more than two plural
  forms (Russian, Polish, Arabic) get the plural text in every form but the one for 1: check them, and write the
  number in the singular source too (`%(count)d bar`) when it can be more than 1 (Russian uses it for 21).
- XLIFF: existing targets are not imported into the memory, and ICU messages (`{count, plural, ...}`) are sent as
  plain text: check their keywords came back untouched.
- YAML: anchors, aliases, tags and flow mappings (`{a: b}`) are refused with the line they are on; a flow list must
  fit on one line.
- HTML: the attributes of an inline element inside a text (`<a title="...">`) stay as they are; the text and the
  attribute would overlap.
- Word: paragraphs with tracked changes and the texts of text boxes are not translated yet.
- ICU messages (`{count, plural, one {...} other {...}}`, in `.arb` and XLIFF files) are sent as they are: check
  their keywords came back untouched.
- Apple: `.stringsdict` plurals are not supported, nor the substitutions of string catalogs (several plurals in one
  text): those strings are left out.
- Typography rules exist for French only (France and Canada) so far.
- A back-translation adds its own mistakes: a verdict is a pointer for a human, not a correction, and small local
  judges are strict (a synonym can be called a nuance). Negations are recognised in English, French, Spanish, German,
  Italian and Portuguese.
- The glossary check only looks for the expected term in the translation; it does not understand grammar.
- In JSON outputs, integer-like keys (`"1"`, `"42"`) come first: a JavaScript rule, the content is unchanged.

## Roadmap

1. **Desktop application**: open a file or a folder, translate, review — no command line needed.
2. **Office documents**: `.xlsx`, `.odt`.

## Contributing

Contributions are welcome, especially new formats: each one is a self-contained reader and writer. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Kazuugnii
