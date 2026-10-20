# Contributing to tradforge

Thank you for your interest! Bug reports, ideas and pull requests are all welcome. New formats are the easiest way to
start: each one is a self-contained reader and writer.

## Getting started

You need Node.js 22 or later.

```sh
git clone https://github.com/ScottMichel/tradforge.git
cd tradforge
npm ci
npm run check      # typecheck + lint + tests
```

| Script | Purpose |
| --- | --- |
| `npm run dev -- <command>` | Run the command line from the sources, e.g. `npm run dev -- status` |
| `npm test` / `npm run test:watch` | Run the tests (Vitest) |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run lint` / `npm run format` | Check / fix lint and formatting (Biome) |
| `npm run coverage` | Test coverage report |
| `npm run build` | Compile to `dist/` |

You do not need Ollama to work on tradforge: the tests use a mock provider and a fake `fetch`.

## How we work

- **Tests first.** Write the test, watch it fail, make it pass. Every behaviour has a test; every bug fix starts with a
  test that reproduces it.
- **Pure core.** `src/core` never touches the disk or the network. Files, network and the command line live in adapters
  (`src/formats`, `src/providers`, `src/storage`, `src/cli`). See [docs/architecture.md](docs/architecture.md).
- **Strict TypeScript**, ES modules, `.js` extensions in imports. Prefer type guards (`value is X`) to `as` casts,
  `readonly` data, string unions to enums.
- **Deterministic output**: sort anything that is written, with a locale-independent comparison.
- **No runtime dependency** without a discussion first: Node.js already provides `fetch`, `parseArgs`, `fs.glob`…
- **No third-party texts.** Tests and examples only use texts written for tradforge — never lines from a game, a mod or
  an application you do not own.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `feat(formats): add YAML reader`,
  `fix(core): ...`, `docs: ...`, `test: ...`, `chore: ...`.

## Adding a format

1. Add its name to `SOURCE_FORMATS` in `src/core/config.ts`.
2. Write a reader in `src/formats/<format>/reader.ts`: a pure function from `{ file, content, priority, context }` to
   occurrences (see the JSON and Lua readers).
3. Write a writer in `src/formats/<format>/writer.ts`: it follows the structure of the source file and replaces the
   texts that have a translation.
4. Register both in `src/formats/readers.ts` and `src/formats/writers.ts`, and give its file extensions in
   `FORMAT_EXTENSIONS` (`src/formats/detect.ts`) — TypeScript will tell you if you forget. A generic extension
   (`.txt`, `.xml`, `.yml`) stays empty: teach `detectSources` to recognise the format by its path instead.
5. Set `Occurrence.group` so that texts that belong together (a conversation, a scene) are translated in one batch.
6. If the format has its own markup, add a placeholder syntax in `src/core/validation/placeholders.ts` and bring it
   with the format in `FORMAT_PLACEHOLDERS` (`src/core/config.ts`) rather than turning it on for everyone.
7. Test the edge cases, and add a round-trip test: what the writer writes, the reader must read back. If you can,
   check it on real files too (counting results, never copying their texts into the repository).

## Adding an engine

1. Add its type to `PROVIDER_TYPES` in `src/core/config.ts` and its settings to the configuration.
2. Implement the `Provider` port of `src/core/provider.ts` in `src/providers/<engine>/provider.ts`. Throw
   `ProviderUnavailableError` when the engine cannot be used at all, `BatchError` when a batch can be retried smaller.
3. Inject `fetch` so that the tests never need the network.
4. Add the case to `src/providers/factory.ts` — the exhaustiveness check will remind you.

## Documentation

The README exists in English (`README.md`) and in French (`README.fr.md`). When a change affects the README, update
both — or say in the pull request that the French version needs an update, and a maintainer will do it.

## Pull requests

Before opening one, run `npm run check`. Describe what changes and why; link the issue if there is one. Keep pull
requests focused: one feature or fix at a time is much easier to review.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE), and you agree to
follow the [Code of Conduct](CODE_OF_CONDUCT.md).
