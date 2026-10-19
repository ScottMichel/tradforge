# 4. Staleness is derived, not stored

- Status: accepted
- Date: 2026-10-19

## Context

A translation is "stale" when its source text is no longer in the project. A first design stored it as a status next
to `machine` and `reviewed`. But those answer two different questions — who produced the translation, and whether the
project still uses it — and mixing them loses information: a reviewed translation whose text disappears and comes back
would no longer be known as reviewed.

## Decision

`TranslationStatus` is `"machine" | "reviewed"` only. Whether a translation is stale is computed when needed, by
comparing the memory with the current texts of the project (`TranslationMemory.stats`, `staleSources`, the CSV export).

## Consequences

- Nothing has to keep a stored flag in sync with the project: it cannot become wrong.
- A text that comes back finds its translation, reviewed status included.
- Computing staleness needs the current texts of the project, which the commands extract anyway.
