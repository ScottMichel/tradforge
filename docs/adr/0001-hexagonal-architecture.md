# 1. Hexagonal architecture

- Status: accepted
- Date: 2026-10-18

## Context

tradforge must support many file formats (JSON, Lua, then subtitles, game formats, documents…) and many translation
engines (Ollama, then hosted APIs). Its value lies in logic that does not depend on either: grouping, validation,
retries, memory, safety checks. That logic must be tested thoroughly, quickly, and without a GPU.

## Decision

Split the code into a **core** of pure logic (`src/core`) and **adapters** around it. The core defines ports —
`Reader`, `Writer`, `Provider` — and never imports node:fs or performs network calls. Formats, engines, storage and the
command line are adapters. Dependencies point inwards only.

Readers and writers are pure functions too: they receive the content of a file and return data; reading and writing
the disk happens in `src/formats/extract.ts` and `src/formats/build.ts`.

## Consequences

- A new format or engine is a new adapter; the core does not change.
- The core and the formats are tested with plain strings; engines with a mock provider and an injected `fetch`. The
  whole suite runs in seconds, without Ollama.
- The command line is just one way to drive the core; a desktop application can be another, reusing everything.
- A little more indirection than a single script: a few interfaces and registries (`READERS`, `WRITERS`).
