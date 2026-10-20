# 7. Legacy encodings, and placeholder syntaxes that come with their format

- Status: accepted
- Date: 2026-10-20

## Context

Game files are not all UTF-8. Among the Build 41 translations of the Project Zomboid mods installed on the
maintainer's machine, about half of the non-English files use a legacy Windows code page (windows-1252 for French,
windows-1251 for Russian...), and a few are UTF-16. Paradox games require UTF-8 with a byte order mark. Writing
UTF-8 where a game expects a code page shows accents as "?": that accident is one of the lessons tradforge was built
on.

The new formats also bring their own markup. In Paradox and RimWorld files, a word in brackets (`[Root.GetName]`,
`[PAWN_nameDef]`) is code that must never be translated; in a JSON interface, `[Note]` is just text.

## Decision

- **Encodings.** Each source has an input encoding, `auto` by default: a byte order mark (UTF-8, UTF-16), then valid
  UTF-8, then windows-1252. Each output has an encoding, `utf-8` by default. Single-byte code pages are encoded
  with a table built from the decoder Node.js already has (no dependency, no table to maintain). A character the
  output encoding cannot hold makes the build fail, listing the files and characters: nothing is written, never a
  silent "?".
- **Format placeholder syntaxes.** `PLACEHOLDER_SYNTAXES` lists every syntax; `DEFAULT_PLACEHOLDER_SYNTAXES` the
  ones checked by default; `FORMAT_PLACEHOLDERS` the ones a format brings with it. `effectivePlaceholders(config)` is
  their union for the formats the project uses, and the pipeline uses it for validation, placeholder protection and
  typography.
- **Format names.** A format that is a dialect of a generic file type is named after both: `paradox-yml`,
  `zomboid-txt`, `rimworld-xml`. The name says what kind of file it reads and that it is not plain YAML, text or XML,
  and leaves room for a generic `yml` or `xml` format later. A format with an extension of its own keeps a short
  name (`renpy` for `.rpy`).

## Consequences

- Legacy game files can be read and written without converting them by hand.
- A Paradox or RimWorld project protects its markup without any setting, and other projects are not affected.
- The union is per project, not per file: a project mixing Paradox and JSON sources checks Paradox markup in its
  JSON texts too. Acceptable for now; a per-segment set of syntaxes is possible later if it matters.
- Multi-byte legacy encodings (Shift-JIS, EUC-KR, GBK) can be read but not written yet.
