# 5. Locale-independent ordering

- Status: accepted
- Date: 2026-10-18

## Context

tradforge writes files that people commit: the memory, translated files, CSV exports. If their order depended on the
machine, two runs on two computers would produce different files for the same content, and Git diffs would be full of
noise. `String.prototype.localeCompare` depends on the default locale of the machine and on the ICU version shipped
with Node.js.

## Decision

Everything that is sorted for output uses `compareCodeUnits` (`src/core/compare.ts`), which compares UTF-16 code
units with `<` and `>`: no locale, no ICU, the same result everywhere. Numbers shown to users are formatted with an
explicit `en-US` locale. A human-friendly order, if ever needed for display, will use `Intl.Collator` with an explicit
locale, never for files.

## Consequences

- The same input always produces byte-identical files, on any machine and any Node.js version.
- The order is not "natural" for humans: `"B"` comes before `"a"`. This only affects files meant for machines and diffs.
