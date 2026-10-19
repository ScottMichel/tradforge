# 2. No runtime dependencies

- Status: accepted
- Date: 2026-10-18

## Context

Every dependency is code that users download and trust, that can break, be abandoned, or be compromised. Node.js 22
already provides what tradforge needs: `fetch`, `AbortSignal.timeout` and `AbortSignal.any`, `node:util` `parseArgs`,
`fs.glob`, `TextEncoder` and `TextDecoder`, `Intl`.

## Decision

tradforge has no runtime dependencies. Development tools (TypeScript, Vitest, Biome, tsx) are development
dependencies only. Small, well-tested pieces are written in the project instead: a Lua string lexer, a CSV reader and
writer, a JSON-with-comments filter, a Levenshtein distance.

A runtime dependency may be added after a discussion, when writing the code ourselves would be unreasonable (for
example reading ZIP archives for office documents).

## Consequences

- Installing tradforge installs tradforge only; the attack surface stays small.
- We own a few more lines of code, each with its own tests.
- Node.js 22 is the minimum version (`engines` in `package.json`).
