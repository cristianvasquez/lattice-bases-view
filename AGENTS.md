# Concept Atlas

Obsidian plugin (id `concept-atlas`). It adds the layout **Concept lattice** to Obsidian Bases. The layout computes a concept lattice (Formal Concept Analysis, FCA) from property values of the notes that Bases supplies. `prompt.md` is the original specification.

## Layout

- `src/fca/`: FCA core. Pure TypeScript. No import of `obsidian`, no DOM. Bit sets, formal context, derivation, closure, concept enumeration (Next Closure) with budgets and cancellation, Hasse cover relations.
- `src/bases/`: Bases adapter. Converts the entries that Bases supplies (`BasesEntry`, evaluated `Value` objects) into a formal context. Object identity is the file path. Attribute identity is `<facet key>:<value in lower case>`. `values.ts` imports the runtime classes of `obsidian`; `atlas.ts` and `facets.ts` import only types.
- `src/view/`: the `BasesView` subclass (`lattice-view.ts`) and the diagram (`diagram.ts`) with DOM code. Pure modules without DOM: `config.ts` (view options), `state.ts` (view state), `model.ts` (display model, displayed part), `layout.ts` (diagram layout), `text.ts` (interface text).
- `src/main.ts`: plugin entry. Registers the Bases view and its options.
- `styles.css`: every selector starts with `.concept-atlas`. Only Obsidian theme variables for colors, fonts and spacing.
- `test/*.test.ts`: vitest. `vitest.config.ts` replaces the `obsidian` module with `test/obsidian-mock.ts` (the npm package has only types). `test/fca-oracle.ts` is a brute-force oracle and a generator of random contexts for the FCA tests.
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

## Extend

- A new value conversion (a new Bases `Value` type, a new rule for text or links): `src/bases/values.ts` (`convertValue`). Attribute ids and incidence: `src/bases/atlas.ts`. Facet resolution: `src/bases/facets.ts`. Add tests in `test/bases-*.test.ts`. When a test needs a new `Value` class, add it to `test/obsidian-mock.ts`.
- A new FCA function: `src/fca/`, exported from `src/fca/index.ts`. Add tests that compare the result with the oracle in `test/fca-oracle.ts` on random contexts, as in `test/fca-known.test.ts`.
- A new view option: add the range or default to `src/view/config.ts` (`readViewConfig`), and the option to `options` in `src/main.ts`. Add tests in `test/view-text.test.ts` (it tests `readViewConfig`).
- A new panel or a new interface text: DOM code in `src/view/lattice-view.ts`, logic in `src/view/model.ts` or `src/view/state.ts`, text in `src/view/text.ts`, styles in `styles.css`. Put the logic in the pure modules so that vitest can test it.

## Manual test in `test-vault`

The runtime behavior in Obsidian has no automated tests. Do these steps by hand after a change of `src/view/`, `src/bases/` or `src/main.ts`:

1. `pnpm verify`, then `pnpm install:vault`.
2. Open `test-vault` as a vault in Obsidian 1.10.0 or later. Enable the core plugin Bases and the community plugin Concept Atlas.
3. Open `Visualization techniques.base`, view "Concept lattice". Make sure that the status shows the size of the full lattice and the number of shown concepts, and that `Not a technique.md` is not in the lattice.
4. Select values in the filters. Make sure that the counts, the disabled values and the mark "shared by all matching notes" change.
5. Click a node, then use the arrow keys and Escape. Use "Filter to this concept". Drag, zoom and "Fit" the diagram.
6. Open a note from the note list. Use "Inspect" and make sure that facets without values show "not annotated".
7. Type in the search field. Make sure that only the note lists change.
8. Change a property value of a note in `Techniques/`. Make sure that the view updates.
9. Change the three view options. Make sure that the view uses the new values.
10. Make the view narrower than 700 px. Make sure that the three regions stack and do not overlap.
11. Close the view while the lattice computes. Make sure that no error shows in the developer console.

An agent can do these steps with the Obsidian CLI when the app runs with `test-vault` open: `obsidian vault=test-vault <command>` with `open path=...`, `eval code=...`, `dev:screenshot path=...`, `dev:errors`. Facts from the test on Obsidian 1.15.1:

- `obsidian <command>` starts the desktop app when it does not run.
- `plugin:reload id=concept-atlas` does not replace a Bases view that is open: the old code continues to run. Use `obsidian vault=test-vault reload` after `pnpm install:vault`.
- Obsidian shows a tooltip for each element with an `aria-label` attribute, and its handler throws on SVG elements. Do not put `aria-label` on SVG elements; use `aria-labelledby`.
