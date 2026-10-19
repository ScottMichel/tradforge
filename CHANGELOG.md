# Changelog

All notable changes to tradforge are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

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
