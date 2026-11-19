# Concept Atlas

Obsidian plugin (id `concept-atlas`). It adds the layout **Concept lattice** to Obsidian Bases. The layout computes a concept lattice (Formal Concept Analysis, FCA) from property values of the notes that Bases supplies. `prompt.md` is the original specification.

## Layout

- `src/fca/`: FCA core. Pure TypeScript. No import of `obsidian`, no DOM. Bit sets, formal context, derivation, closure, concept enumeration (Next Closure) with budgets and cancellation, Hasse cover relations.
- `src/bases/`: Bases adapter. Converts the entries that Bases supplies (`BasesEntry`, evaluated `Value` objects) into a formal context. Object identity is the file path. Attribute identity is `<facet>:<value>`.
- `src/view/`: the `BasesView` subclass and its DOM code (filters, diagram, concept panel, inspector).
- `src/main.ts`: plugin entry. Registers the Bases view.
- `styles.css`: every selector starts with `.concept-atlas`. Only Obsidian theme variables for colors, fonts and spacing.
- `test/*.test.ts`: vitest. `test/obsidian-mock.ts` replaces the `obsidian` module at test time (the npm package has only types).
- `test-vault/`: the vault for manual tests. Sample notes and a sample `.base` file. Never install into another vault of the user without a request.
- `scripts/install-to-vault.mjs`: copies `main.js`, `manifest.json`, `styles.css` into a vault.

## Commands

- `pnpm install`
- `pnpm verify`: `tsc --noEmit`, `vitest run`, production build of `main.js`. It must pass before a commit.
- `pnpm dev`: build in watch mode.
- `pnpm install:vault [vault path]`: install the build into `test-vault` (default) or another vault.

Use `pnpm`, not `npm`. Do not run `pnpm rebuild`.

## Rules

- Take the note data only from the entries of Bases (`this.data` in `onDataUpdated`), so that the filters and formulas of the base apply. Do not parse the `.base` file. Do not read the vault for data.
- A missing property value means "not annotated". It is never negative evidence. The code and the interface text must not say that a note does not have a property.
- The lattice shows the recorded attributes. An implication that holds in the data is an observation about the records, not a rule about the domain. The interface text must say this.
- Keep the full lattice of the context and the displayed part as two different things in the code and in the interface text.
- Concept enumeration must have a budget and must not block the UI thread for a long time. A view that unloads must cancel its computation and remove its listeners.
- No network access, no telemetry.
- `src/fca/` must stay free of `obsidian` and DOM imports. Each change of it needs tests.
- `main.js` is a build output. It is not committed.
- Supported Obsidian version: 1.10.0 or later (the public Bases view API: `registerBasesView`, `BasesView`). The types come from the npm package `obsidian`; read `node_modules/obsidian/obsidian.d.ts` before you use an API.
- Prose: ASD-STE100 Simplified Technical English. Short sentences. No hard-wrapped paragraphs. The filename is `readme.md`, never `README.md`.
- No `git push` and no pull requests. The orchestrator merges and pushes with `gitea-cli push`.
