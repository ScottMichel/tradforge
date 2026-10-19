# 3. One memory file, written atomically

- Status: accepted
- Date: 2026-10-19

## Context

Translating a large project takes hours (about 17 for the 98,000 sentences of the case study). It will be interrupted:
Ctrl+C, a crash, a reboot. Losing or corrupting the memory would lose hours of work. The memory holds two kinds of
data — accepted translations and failed attempts — that must stay consistent with each other.

## Decision

- The memory is **one** file, `<workDir>/memory.json`, holding translations and failures together. Two files could not
  be updated together: an interruption between the two writes would leave a text both translated and failed.
- It is written **atomically**: write a temporary file next to it, flush it to the disk (`fsync`), then rename it over
  the old one. A rename within one file system is atomic: readers see the old file or the new one, never half of one.
- It is saved **after every batch**, in a `finally` block, so a failing batch keeps what it achieved.
- The file is versioned (`"version": 1`) and records its languages; loading the memory of other languages is refused.
- Entries are sorted and indented with a fixed key order, so the file diffs cleanly in Git and can be committed.

## Consequences

- An interruption loses at most the batch in progress; the next run resumes without redoing anything.
- The whole file is rewritten after each batch. For very large memories this costs some time; a different storage
  (append-only log, SQLite) can replace it later behind the same functions.
- On Windows, an antivirus scanning the file at the moment of the rename can make it fail (`EPERM`); retries may be
  needed if this happens in practice.
