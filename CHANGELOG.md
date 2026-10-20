# Changelog

All notable changes to tradforge are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

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

- Texts are no longer sorted alphabetically before translation, but kept in the order of their files.
- The `translate` summary tells how many translations were reused.

### Fixed

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
