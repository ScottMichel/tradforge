# 6. Translate in file order, with neighbouring lines as context

- Status: accepted
- Date: 2026-10-20

## Context

Texts used to be sorted by priority, then alphabetically, before being cut into batches. The order was deterministic,
but a line of dialogue ended up next to unrelated texts: the model never saw the conversation it belonged to, and the
tone or the form of address (French "tu" or "vous") could change from one line to the next.

## Decision

- Segments are sorted by priority, then by **order of first appearance**. Files are read in sorted order, so this is
  as deterministic as the alphabetical order (see [ADR 5](0005-locale-independent-ordering.md), which still governs
  every file tradforge writes).
- Readers guess **groups** of texts that belong together (same JSON object; Lua lines with no blank line between
  them), and a source can set its own rule. The pipeline keeps a group in one batch whenever it fits.
- Each batch is sent with up to `contextLines` lines **before and after** it in the same file, with their translation
  when known. The model uses them for meaning and tone, and is told never to translate or return them.

## Consequences

- Better consistency of tone and form of address, observed on real runs.
- Slightly larger requests: a few context lines per batch, not per text. `contextLines: 0` turns this off.
- Tests and tools that relied on the alphabetical order of segments had to change.
