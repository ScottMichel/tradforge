# Changelog

All notable changes to tradforge are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Desktop application (`packages/desktop`, preview; `npm run desktop` from the sources): open a folder, choose the
  formats found in it, set the languages and the engine (installed Ollama models listed, API keys detected without
  being shown), translate with a live progress that can be stopped, correct and approve translations, write the
  translated files. It works on the same `tradforge.config.json` and memory as the command line.
- The library exports `openProject`, `renderConfig`, `CONFIG_FILE`, `ConfigFileError`, `stripJsonComments`,
  `writeFileAtomic` and `memoryFilePath`, for programs that drive a project as the command line does.
- `odt` format: OpenDocument texts (LibreOffice Writer). Paragraphs and headings of the body, headers and footers,
  spans and links kept as tags, spaces read and written as ODF does; the language is set and the `mimetype` stays
  the first entry, stored.
- `xlsx` format: Excel workbooks. The shared strings are translated in place (once for every cell that shows them),
  rich text keeps its formats, and the inline strings of the sheets and the text boxes of the drawings are
  translated too. Numbers, formulas, sheet names and strings without letters stay as they are.
- `pptx` format: PowerPoint presentations. The paragraphs of the slides (text boxes, shapes, tables) and of the
  speaker notes, read and written as for Word documents; the texts of a slide are translated together.
- `docx` format: Word documents. Each paragraph is one text, its formats as tags, and its runs are rebuilt in the order
  of the translation; tables, headers, footers and notes are translated, the language is set for spelling, and
  every other part of the archive is copied byte for byte. `tradforge init` proposes `.docx` files
  (`manual.docx` → `manual.fr.docx`).
- Formats can work on bytes (`BinaryReader`, `BinaryWriter`): the output encoding does not apply to them. Office
  documents use a small ZIP reader and writer of tradforge's own, without dependency.
- `html` format: the texts of a page between block tags, inline tags kept and checked, and the attributes people
  read (`alt`, `title`, `placeholder`, `aria-label`, description meta tags). Pages are read as browsers read them;
  scripts, styles and `<pre>` are left out, and `<html lang>` names the target language. `tradforge init` proposes
  pages of the source language, not generated ones (coverage, build folders).
- `markdown` format: headings, paragraphs, list items, quotes, table cells and the title of a YAML front matter,
  code and HTML blocks left out. A wrapped paragraph is one text and is written back on one line; the texts of a
  section are translated together. `tradforge init` proposes READMEs and documentation folders
  (`README.md` → `README.fr.md`), not changelogs or licences.
- `markdown` placeholders: inline code and link destinations must come back untouched (with the `markdown` format).
- `xcstrings` format: Xcode string catalogs. A catalog holds every language, so the translation is written into the
  catalog itself (the only format allowed to, see `MULTILINGUAL_FORMATS`): only the target language changes, a
  translation made in Xcode is never removed, plural variations get the categories of the target language, and the
  layout of Xcode is kept so that a diff shows only the new lines.
- `properties` format: Java resource bundles. Every separator, continuation and escape of the format; the doubled
  apostrophes of MessageFormat texts are given to the translator as one and doubled again on writing. `tradforge
  init` proposes bundles (`messages.properties`, `messages_en.properties`), not settings files.
- `resx` format: .NET resources. Strings only (no files, objects or designer data), comments as context.
  `Strings.resx` → `Strings.fr.resx`.
- `arb` format: Flutter's Application Resource Bundles. Descriptions as context, `@@locale` renamed, metadata kept.
- The `braces` placeholders include the arguments of Java's MessageFormat (`{0,number,integer}`).
- `ios-strings` format: the `.strings` files of Apple platforms (`en.lproj/`, `Base.lproj/`), the comment above each
  entry sent as context, every escape of the format decoded and written back. `tradforge init` proposes `fr.lproj/`.
- The `printf` placeholders include Apple's `%@` and the length modifiers of C (`%ld`, `%lld`, `%zu`).
- `android` format: Android string resources (`res/values/strings.xml`). Strings, string array items and plural
  quantities are read as Android reads them (backslash escapes, quotes that keep spaces, merged spaces), inline
  `<xliff:g>` and `<b>` tags must come back, plurals get the quantities of the target language, and resources marked
  `translatable="false"` are left out of the translation. `tradforge init` proposes `res/values-fr/` (`values-pt-rBR/`).
- `yaml` format (`.yml`, `.yaml`): Rails, Symfony, i18next and Hugo translation files, read by a small parser without
  dependency. Every string style is supported; booleans, numbers, dates and null are left out as YAML 1.1 reads them
  (a plain `No` is a boolean). Values are replaced in place in their own style when it is safe, and the `en:` root
  of Rails files is renamed. Anchors, aliases, tags and flow mappings are refused with their line.
- The `printf` placeholders include the named placeholders of Ruby (`%{count}`).
- `xliff` format: XLIFF 1.2 and 2.x (`.xlf`, `.xliff`), as Angular and translation tools write them. Inline elements
  stay in the text and must all come back (`markup` is always checked for this format), notes go to the translator
  as context, units of several segments are translated together, and targets are written in place or added after
  their source. `tradforge init` proposes the files of the source language that hold no translation yet.
- `po` format: gettext catalogs and templates (`.po`, `.pot`). `msgctxt` and the notes of the developers go to the
  translator as context, singular and plural are translated together, and the output gets the plural forms and the
  `Plural-Forms` header of the target language, a UTF-8 charset, and no `fuzzy` flag on translated entries.
  `tradforge init` proposes the templates and the catalogs of the source language.
- The `printf` placeholders include the named placeholders of Python (`%(count)d`).
- `tradforge verify`: suspicious machine translations (numbers changed, negation lost, length out of proportion,
  text left as it was), or all of them with `--all`, are translated back and judged by a language model (`same`,
  `nuance`, `different`, with a note). Verdicts are kept in the memory until the translation changes, and exported
  in the review CSV. `--judge` picks the judge; DeepL translates back but cannot judge.
- `tradforge compare --engines <type[:model],...> [--sample <n>]`: the same sample translated by several engines,
  with the real validation and a throwaway memory; a table (translated, failed, time, cost of the rest of the
  project), the texts on which they disagree side by side, and a CSV of every translation.
- An engine that does not answer 3 times in a row stops the run, instead of being retried with ever smaller batches.
- `deepl` engine: placeholders protected as `<x id="n"/>` tags (`tag_handling: xml`), XML characters escaped,
  instructions and neighbouring lines sent as DeepL context, the glossary turned into a DeepL glossary reused across
  runs, `formality`, free and paid addresses guessed from the key, 50 texts per request, cost per character.
- `gemini` engine, through the Google generateContent API: the answer schema is converted to the OpenAPI subset
  Gemini accepts; the delay of a rate limit is read from Google's RetryInfo, and a used-up daily quota stops the run.
- `anthropic` engine for Claude, through the Messages API: answers are forced through a tool whose input follows
  the answer schema; an overloaded API (HTTP 529) is waited for like a rate limit.
- `translate --dry-run` estimates the tokens sent and received, measured on the real prompt, and the cost with
  `provider.pricing` (`inputPerMillion`, `outputPerMillion`).
- Rate limits: on HTTP 429, every batch pauses for the delay the server asks (`Retry-After`), or 1 s, 2 s, 4 s...,
  then the same batch is sent again without counting an attempt. A used-up quota stops the run.
- `translation.concurrency`: several batches sent at the same time, for remote APIs. Saves of the memory never
  overlap; an interruption or a fatal error lets the batches in flight finish and keeps them.
- `openai-compatible` engine: OpenAI, Mistral, OpenRouter, Groq, LM Studio, vLLM... (`provider.baseUrl`,
  `provider.apiKeyEnv`, `provider.responseFormat`). The API key is read from an environment variable; a key written in
  the configuration is refused, and keys are never shown in messages.
- Six new formats, all recognised by `init`:
  - `srt` and `vtt` subtitles: one text per cue, cues less than 2 seconds apart translated together as a scene;
  - `renpy`: dialogue, menu choices and `_()` strings of Ren'Py scripts (`.rpy`), written as translated copies;
  - `zomboid-txt`: Project Zomboid Build 41 translation tables (`.txt`), read the way the game reads them; Build 42
    files are JSON;
  - `paradox-yml`: Paradox localisation files (`.yml`, Paradox dialect), with their language names and the required
    UTF-8 BOM;
  - `rimworld-xml`: Keyed and DefInjected language files of RimWorld (`.xml`, `<LanguageData>` root), with a small
    XML parser of our own.
- Legacy encodings: `sources[].encoding` (`auto` by default) and `output.encoding` (`utf-8-bom`, `utf-16le`,
  `windows-1252`, `windows-1251`...). A character the output encoding cannot hold is an error, never a `?`.
- Output path placeholders `{stem}` (name without its language suffix), `{LANG}` (capitals) and `{language}`
  (English name).
- Placeholder syntaxes `positional` (`%1`), `bbcode` (`[img=x]`), `ass` (`{\an8}`) and `timestamp`
  (`<00:00:01.500>`), on by default; `paradox`, `renpy` and `rimworld`, on automatically for their formats
  (`paradox-yml`, `renpy`, `rimworld-xml`) only.

- Conversations: texts are translated in the order of their files, and each batch is sent with its neighbouring
  lines (and their translation when known) as context, so that the tone and the form of address stay consistent
  (`translation.contextLines`, default 3).
- Conversation groups kept in one batch: guessed from the structure (same JSON object, Lua lines with no blank line
  between them) or set per source with `sources[].group` (`auto`, `none`, `file`, or a `keyPattern`).
- French typography fixed automatically: non-breaking spaces before `; : ! ?` and inside `« »`, Canadian French
  rules included, placeholders, tags, URLs and times left alone (`translation.typography`).
- Glossary check: a translation that ignores the glossary is rejected (`validation.glossary`).
- Reuse of slightly changed texts: when only the punctuation changed, the old translation is adapted without the
  model; otherwise it is shown to the model as a hint (`translation.reuse`).
- Placeholder protection for engines that cannot be told to keep placeholders: they are replaced with numbered tags
  before the request and put back after.
- `init` finds the text files of the folder (JSON files with a language marker in their path, Lua files), fills the
  configuration with them and explains what it left out; new `--from` and `--to` options.
- A hygiene test rejects invisible characters (unusual spaces, byte order marks, control characters) in the code.

### Changed

- The repository is an npm workspace: the `tradforge` package (command line and library) lives in `packages/cli`,
  ready for the desktop application next to it. The scripts still run from the root (`npm run check`, `npm run dev`).
- Texts are no longer sorted alphabetically before translation, but kept in the order of their files.
- The `translate` summary tells how many translations were reused.

### Fixed

- French typography no longer puts a space inside a character reference (`&unknown;`, `&#233;`) left in a text.
- DeepL: a free account holds a single glossary, so changing the project glossary failed with HTTP 456. The older
  glossaries that tradforge made for the same language pair are now deleted to make room; other glossaries are
  never touched.
- Placeholders that touch (`{hour}:{minute}`, `%d/%d`) are protected as one tag: a real DeepL run had put a space
  inside the time. Protected tags are numbered in the order of the text.
- The JSON writer used an invisible character in a regular expression; it now uses a readable escape.

## [0.1.0] - not published yet

First version.

### Added

- Command line: `init`, `status`, `extract`, `diff`, `translate`, `build`, `export`, `import`, with clear errors and
  exit codes (`0`, `1`, `2`, `130`).
- Commented configuration file (`tradforge.config.json`), with every problem reported at once.
- JSON and Lua readers and writers. The Lua reader understands every kind of string literal and skips code-like
  strings; writers keep the structure of the source files and can escape non-ASCII characters.
- Translation with a local model through Ollama, with a JSON schema enforced on the answers.
- Strict validation: placeholders lost or invented, tags, line breaks, action markers, surrounding spaces,
  untranslated texts, excessive length.
- Retries in smaller groups (batch, quarter, single text) and a failure log with reasons.
- Translation memory saved atomically after every batch; resume after an interruption; human reviews never
  overwritten by the model.
- CSV export and import for human review.
- `diff`: new, removed and slightly changed texts (Levenshtein similarity).
- Safety nets on output: no overwriting of a source file, no output outside the project, no large file replaced by a
  much smaller one without `--force`.
