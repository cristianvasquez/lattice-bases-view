# Concept Atlas

Obsidian plugin (id `concept-atlas`). It adds the layout **Concept lattice** to Obsidian Bases. The layout computes a concept lattice (Formal Concept Analysis, FCA) from property values of the notes that Bases supplies. `prompt.md` is the original specification.

## Layout

- `src/fca/`: FCA core. Pure TypeScript. No import of `obsidian`, no DOM. Bit sets, formal context, derivation, closure, concept enumeration (Next Closure) with budgets and cancellation, Hasse cover relations.
- `src/bases/`: Bases adapter. Converts the entries that Bases supplies (`BasesEntry`, evaluated `Value` objects) into a formal context. Object identity is the file path. Attribute identity is `<facet key>:<value in lower case>`. `values.ts` imports the runtime classes of `obsidian`; `atlas.ts` and `facets.ts` import only types.
- `src/view/`: the `BasesView` subclass (`lattice-view.ts`) and the diagram (`diagram.ts`) with DOM code. The view has a row of panel toggles ("Filters", "Lattice", "Notes", `aria-pressed`) and three columns: filters (left), a center column with the status line, the toolbar, the hint and the diagram, and the notes column (right) with the search field, the count line, the line of the focused concept and the note list. A hidden panel is `display: none` and stays in the DOM with its state; the flags are stored with `App.saveLocalStorage` (key `concept-atlas-panels`), and the rules (visible handles, flexible column, disabled toggle) are in `panels.ts` (`panelLayout`). While the lattice is hidden, the diagram is not drawn and the lazy `layout` of the model is not read. Two drag handles (`role="separator"`) set the widths of the filters column and the notes column; the widths are stored with `App.saveLocalStorage` (key `concept-atlas-column-widths`) and computed in `columns.ts`. Each grid item has a fixed track; the view sets the tracks (`--concept-atlas-*-track`). A change of the filter, the focus, the hover or the search must not change the size of the diagram viewport; the viewport `ResizeObserver` fits the diagram only on a real resize. The diagram layout (`layout.ts`) limits the number of nodes per layer by the viewport width (`maxNodesPerLayer`, `assignLayersBounded`: topological order, each node in the first layer below its upper neighbours that has room), so that the diagram fits the width at scale 1 and grows downward; the node width comes from the longest label (`nodeWidthFor`, an estimate per character, no DOM measure). The part keeps one layout per number of nodes per layer (`layoutFor`); the viewport `ResizeObserver` builds the model again only when that number changes. The wheel scrolls the diagram; Ctrl+wheel zooms. The toolbar button "Back" calls `backFilter`. Pure modules without DOM: `config.ts` (view options), `state.ts` (view state, with the stack of previous filters), `columns.ts` (column widths), `panels.ts` (panel visibility), `model.ts` (display model, displayed part), `layout.ts` (diagram layout), `text.ts` (interface text).
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
5. Click a node, then use the arrow keys and Escape. Make sure that the diagram does not move, that the notes of the focused concept move to the top of the notes column with the accent bar, and that the other notes stay faded. Click the diagram background and make sure that the focus and the order go back. Point at a node with no click and make sure that its notes are marked with no change of order and no scroll. Use "Filter to this concept" and make sure that the start node gets the keyboard focus. Double-click a node that is not the start node: make sure that the filter changes to its concept and that the start node gets the keyboard focus. Double-click two levels down, then click "Back" two times: make sure that each click goes back one level, that the start node gets the keyboard focus, and that "Back" is disabled at the first level. Do the same with a double-click on the start node and with Shift+Enter. Drag the diagram. Use the wheel: make sure that it scrolls the diagram up and down and does not zoom. Use Ctrl+wheel and `+`/`−` to zoom. Click "Fit".
6. Open a note from the notes column. Make sure that the list shows one note per line, that long names have an ellipsis and a tooltip, and that the list scrolls inside the column when it is long.
7. Type in the search field of the notes column. Make sure that only the note list and the count line change, and that the diagram does not move. Make sure that "Clear filters" clears the search.
8. Change a property value of a note in `Techniques/`. Make sure that the view updates.
9. Change the three view options. Make sure that the view uses the new values.
10. Make the view narrower than 700 px. Make sure that the filters, the diagram and the notes column stack in this order, do not overlap, that the note list has no inner scroll bar, and that the drag handles are hidden. Hide a panel with its toggle and make sure that it is not in the stack.
11. In the wide layout, drag the handle at the right of the filters column and the handle at the left of the notes column. Make sure that the cursor is `col-resize`, that the handle shows an accent line on hover and during the drag, that each side column is 10rem wide at least and has no fixed maximum, that the diagram keeps at least 12rem, and that the diagram fits again. Tab to a handle and use ArrowLeft and ArrowRight. Double-click a handle and make sure that its column gets the default width. Reload Obsidian and make sure that the widths stay.
12. Make the lattice column narrow (drag the handles) and wide again. Make sure that the diagram wraps into more layers with fewer nodes, that each edge goes down, that the initial view and "Fit" show the full width at scale 1 with no horizontal pan, and that a resize of a few pixels does not draw the diagram again.
13. Click the toggles "Filters", "Lattice" and "Notes". Make sure that each click hides or shows its panel, that `aria-pressed` changes, that the toggle of the last visible panel is disabled, and that a handle shows only between two visible panels. Hide the lattice: make sure that the notes column takes the remaining width and that the note list has several columns when the column is wider than 30rem. Hide the notes column too: make sure that the filters column takes the full width. Before you hide a panel, set a filter, focus a concept, type a search text and scroll the lists; show the panel again and make sure that these stay. Change the filter while the lattice is hidden, show the lattice and make sure that the diagram shows the new filter and is fitted. Reload Obsidian and make sure that the visibility stays.
14. Close the view while the lattice computes. Make sure that no error shows in the developer console.

An agent can do these steps with the Obsidian CLI when the app runs with `test-vault` open: `obsidian vault=test-vault <command>` with `open path=...`, `eval code=...`, `dev:screenshot path=...`, `dev:errors`. Facts from the test on Obsidian 1.15.1:

- `obsidian <command>` starts the desktop app when it does not run.
- `plugin:reload id=concept-atlas` does not replace a Bases view that is open: the old code continues to run. Use `obsidian vault=test-vault reload` after `pnpm install:vault`.
- Obsidian shows a tooltip for each element with an `aria-label` attribute, and its handler throws on SVG elements. Do not put `aria-label` on SVG elements; use `aria-labelledby`.
