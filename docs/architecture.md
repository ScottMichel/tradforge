# Architecture

tradforge is a pipeline: files go in, translated files come out, and a translation memory keeps the work in between.

```text
project files ─► find ─► read ─► group ─► skip known texts ─► batches ─► translate ─► validate ─► memory ─► build ─► translated files
                                                                              ▲              │
                                                                              └── retry ◄────┘  (quarter of the batch, then one text alone)
```

## Core and adapters

The code is split in two layers ("hexagonal architecture", or ports and adapters):

- **The core** (`src/core`) is pure logic. It never touches the disk or the network, so it is fast to test and easy to
  reason about. It defines **ports**: the interfaces it needs from the outside world.
- **Adapters** implement those ports, or drive the core:

| Port (in `src/core`) | Adapters | Folder |
| --- | --- | --- |
| `Reader` — extract texts from one file | JSON, Lua, SRT, WebVTT, Ren'Py, Project Zomboid, Paradox, RimWorld | `src/formats/<format>/reader.ts` |
| `Writer` — write the translated version of one file | the same formats | `src/formats/<format>/writer.ts` |
| `Provider` — translate a batch of texts | Ollama, mock | `src/providers/<engine>/provider.ts` |
| — | Translation memory on disk, CSV review | `src/storage` |
| — | Command line (drives the core) | `src/cli` |

Dependencies only point inwards: adapters import the core, the core never imports an adapter. Adding a format or an
engine means writing an adapter; the core does not change. See [ADR 0001](adr/0001-hexagonal-architecture.md).

## The core, module by module

| Module | Role |
| --- | --- |
| `types.ts` | The data model: `Occurrence` (a text found at one place), `Segment` (a unique text and all its places), `TranslationEntry`, `FailedTranslation` |
| `config.ts` | `parseConfig`: untrusted JSON in, complete typed configuration out, every problem reported at once |
| `segments.ts` | `groupOccurrences`: identical texts become one segment, translated once, kept in file order |
| `groups.ts` | `groupRule`: applies the grouping rule of a source (conversations kept in one batch) |
| `validation/` | `validateTranslation`: placeholders, markup, line breaks, markers, spaces, untranslated, glossary, length |
| `typography.ts` | `fixTypography`: typography of the target language (French non-breaking spaces) |
| `protection.ts` | `protectPlaceholders` / `restorePlaceholders`: placeholders hidden behind numbered tags for some engines |
| `reuse.ts` | `reuseTranslation`: adapts the translation of a text whose punctuation only changed |
| `memory.ts` | `TranslationMemory`: translations by source text, review protection, failure log, statistics |
| `pipeline.ts` | `translateSegments`: reuse, batches by group, context lines, retries, validation, saving after every batch, progress, interruption |
| `diff.ts` | `diffSources`: new, removed and slightly changed texts (Levenshtein similarity) |
| `languages.ts` | `languageName`: "fr" → "French" |
| `reader.ts`, `writer.ts`, `provider.ts` | The ports |

## Life of a text

1. **Find** — `listProjectFiles` expands the `include` patterns with `fs.glob`, skips the work directory and every file
   that is the output of another one (tradforge never reads its own translations back).
2. **Read** — the reader of the format returns occurrences: the text, its file, its key (JSON) or line (Lua), the
   priority and context of its source, and the group it belongs to. The grouping rule of the source is applied.
3. **Merge** — identical texts become one segment; the highest priority wins; segments keep the order of the files.
4. **Select** — `selectSegments` drops what the memory already has (and past failures, unless `--retry`).
5. **Reuse** — a text that replaces a text of the memory with only its punctuation changed gets the old translation,
   adapted, without the model; a text with more changes gets the old translation as a hint.
6. **Translate** — segments are sent in batches that keep groups whole, with the lines around them as context. The
   provider builds the instructions (languages, rules, project instructions, the glossary terms used in the batch)
   and enforces a JSON answer. Engines that ask for it get placeholders hidden behind numbered tags.
7. **Validate** — placeholders are put back, the typography is fixed, then every answer is checked. Rejected texts are
   retried: a quarter of the batch at a time, then alone. After three tries, the failure and its reason go to the
   memory.
8. **Remember** — accepted translations go to the memory, which is saved atomically after every batch.
9. **Build** — each writer follows the structure of its source file. All outputs are planned and checked (overwriting a
   source, leaving the project, two files to one output, a large file becoming much smaller) before anything is written.

## Errors

Each error type tells the caller what to do:

| Error | Meaning | The command line... |
| --- | --- | --- |
| `ConfigError` / `ConfigFileError` | The configuration is wrong | lists every problem, exit 1 |
| `ReadError` | A source file cannot be parsed | names the file (and the line), exit 1 |
| `BatchError` | One batch failed (unreadable answer, timeout) | retries with smaller batches |
| `ProviderUnavailableError` | The engine cannot be used at all | stops and explains (`ollama serve`, `ollama pull`), exit 1 |
| `OutputError` | An output would be dangerous to write | writes nothing, exit 1 |
| `UsageError` | The command line itself is wrong | exit 2 |

## Decisions

The reasons behind the main choices are recorded as Architecture Decision Records in [`docs/adr`](adr):

1. [Hexagonal architecture](adr/0001-hexagonal-architecture.md)
2. [No runtime dependencies](adr/0002-no-runtime-dependencies.md)
3. [One memory file, written atomically](adr/0003-one-memory-file-written-atomically.md)
4. [Staleness is derived, not stored](adr/0004-staleness-is-derived.md)
5. [Locale-independent ordering](adr/0005-locale-independent-ordering.md)
6. [Translate in file order, with neighbouring lines as context](adr/0006-translate-in-file-order.md)
7. [Legacy encodings, and placeholder syntaxes that come with their format](adr/0007-encodings-and-format-placeholders.md)
