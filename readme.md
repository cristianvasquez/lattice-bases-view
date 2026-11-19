---
repo-uri: osg://repo/local:06642ecd189313f8e47c74dc22023513c63e8c39
tags: [repo/pkm]
layout: node.js
---
# [lattice-bases-view](osg://repo/local:06642ecd189313f8e47c74dc22023513c63e8c39)

## What it does

Lattice Bases View adds the layout "Concept lattice" to Obsidian Bases. The layout computes a concept lattice (Formal Concept Analysis) from the values of the properties that you select for the view in the base (the facets). Each concept is a set of notes and the set of values that all these notes share.

## Supported Obsidian version

Obsidian 1.10.0 or later (`minAppVersion` in `manifest.json`). The core plugin Bases must be enabled. If Bases is not enabled, the plugin shows a notice and does not add the layout.

## Build

```sh
pnpm install
pnpm verify   # tsc --noEmit, vitest run, production build of main.js
pnpm build    # production build of main.js only
```

`pnpm verify` runs 12 test files with 156 tests.

## Installation

From a release: download `main.js`, `manifest.json` and `styles.css` from a GitHub release and put them in `<vault>/.obsidian/plugins/lattice-bases-view/`. The workflow `.github/workflows/release.yml` makes a release when a tag with the version of `manifest.json` is pushed (for example `0.1.0`, without `v`).

From the source:

1. Build `main.js` with `pnpm build`.
2. Install into the test vault: `pnpm install:vault`. Install into another vault: `pnpm install:vault <vault path>`. The script copies `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/lattice-bases-view/`.
3. In Obsidian, open Settings → Community plugins and enable "Lattice Bases View".

## Usage

Open a base. Add a view and select the layout "Concept lattice". The view uses only the notes that the filters and formulas of the base give.

Facets: select the properties to compare in the Properties menu of the view (the same menu that sets the columns of the Table layout). Each selected property is a facet, in the order of the menu. The heading of a facet group and the facet name in node labels are the display name of the property in the base. When no usable property is selected, the view shows: "Select the properties to compare in the Properties menu of this base. The Concept lattice groups the notes by the values of these properties." When you change the selected properties, the view draws again, and the filter keeps only the values of the properties that are still selected.

- Note properties, for example `structure`, `data`, `task`, `interaction` in the sample vault.
- File properties: `file.folder` (the folder of the note), `file.tags` (the tags), `file.links` (the links in the note).
- Formulas of the base.
- The plugin ignores the properties that identify one note: `file.name`, `file.basename`, `file.path`, `file.file`. They give one value per note and no shared concept.
- Tags (`file.tags`, `note.tags`): a flat tag such as `#draft` is a value of the tags facet. A nested tag is a value of a facet that comes from the tag path: `#pimo/language/python` gives the facet `language` with the value `python`. All the segments but the last are the parent path; each parent path is one facet, named with its last segment. When two facets have the same name, the facet from tags shows its path (`#pimo/language`). A tag facet and a property with the same name stay two facets. The parent tags (`#pimo`, `#pimo/language`) do not give values. When no note has a flat tag, the view does not show the tags facet itself.
- Two selected properties with the same name without the type prefix (for example `note.score` and `formula.score`) give the same facet key. The view uses the first one and shows a warning.

In the `.base` file, the selected properties are the key `order` of the view.

Removed option: the view options do not have the earlier option for facets (key `facets`). When a view has no usable selected property and its stored config has a `facets` list (a base made with an earlier version), the view uses that list.

View options:

| Option | Default | Range | Function |
| --- | --- | --- | --- |
| Concept budget (full lattice) | 5000 | 500 to 20000, step 500 | The maximum number of concepts that the plugin computes for the full lattice. |
| Concepts in the diagram | 20 | 10 to 150, step 5 | The maximum number of concepts in the diagram. |

Parts of the view, from left to right: filters, diagram (lattice), notes.

- Panel toggles: the buttons "Filters", "Lattice" and "Notes" at the top right hide or show each panel. A pressed button means that the panel shows. At least one panel stays visible: the button of the last visible panel is disabled. A hidden panel keeps its state: the filter, the focused concept, the search text and the scroll position stay. While the lattice is hidden, the plugin does not draw the diagram; when the lattice shows again, the diagram is drawn and fitted. The plugin stores the three flags per vault on the device (`App.saveLocalStorage`, key `lattice-bases-view-panels`). Stored data that is not valid gives all panels visible.
- Column widths: the filters column is 15rem wide and the notes column 17rem by default; the diagram gets the remaining width. Drag the handle at the border of the filters column or of the notes column to change its width. A side column is 10rem wide at least. Its maximum is the width of the view minus the other side column minus the minimum of the diagram (12rem). When the lattice is hidden, the notes column gets the remaining width (10rem at least); when the notes column is hidden too, the filters column gets the full width. A handle shows only between two visible panels when its column has a set width. The handles also take the keyboard focus: ArrowLeft and ArrowRight move the handle by 16 px. Double-click a handle to restore the default width of its column. The plugin stores the two widths per vault on the device (`App.saveLocalStorage`, key `lattice-bases-view-column-widths`), not in the `.base` file.

- Filters: one group of check boxes for each facet. Each value shows the number of matching notes. Selected values combine with AND. A value that all matching notes share has the mark "shared by all matching notes". A value that no matching note has is disabled. "Clear filters" removes the selected values, the search text and the focus.
- Diagram: the concepts below the current filter. Each node shows the values that it adds to the concepts above it, and its number of notes in parentheses, for example `interaction: select (6)`. A node that adds no value is small and shows only its number of notes, for example `(3)`. Point at a node, or move the keyboard focus to it: the diagram marks the node, all concepts above it and the edges between them. The values of the marked concepts together are the values of the node. The focused concept stays marked while the pointer is not on another node. Layout: each edge goes down from a concept to a more specific concept. The number of nodes per layer is limited by the width of the diagram column, so that the diagram fits the width at scale 1 and grows downward. A narrow column gives more layers with fewer nodes. A concept is not always in the layer directly below its upper neighbours, and an edge can pass over layers. The node width follows the longest label of the displayed part (72 to 168 px). When the column width changes enough to change the number of nodes per layer, the diagram is laid out again and fitted. Drag to move the diagram. The mouse wheel scrolls the diagram up and down (Shift+wheel: left and right). Ctrl+wheel, a pinch on a trackpad, or the buttons `+` and `−` zoom. "Fit" and the initial view show the top of the diagram at the top of the view, centered, at the largest scale from 0.7 to 1 at which the width fits. When the width does not fit at 0.7, the top concept is at the top center of the view; drag to see the rest. Click a node, or press Enter or Space on it, to focus it. The arrow keys move the focus to a neighbour node. Escape, or a click on the diagram background, removes the focus. Double-click a node, or press Shift+Enter on it, to filter to its concept (as the link "Filter to these K" in the notes column). The button "Back" in the diagram toolbar goes back to the filter before; a double-click on the top concept (the start node), or Shift+Enter on it, does the same. This works for more than one level. The button is disabled when there is no filter before. A change of a check box and "Clear filters" remove the previous filters. A change of the filter, the focus or the search does not move the diagram.
- Notes: a column at the right. From top to bottom: the search field "Search note names", the count line ("N notes", or "N notes match the filter"; with a search text also "K shown"), and the list of the notes of the current filter, one per line, in the order of Bases. When the notes column is wider than 30rem, the list has several columns of 16rem, in the same order (down, then to the next column). The search filters the list by name. It does not change the lattice. Click a note name to open the note (with Ctrl or Cmd: in a new tab). A long name is cut; the tooltip shows the full name.
- Focused concept in the notes column: the link "Filter to these K" when the values of the concept are different from the current filter (a click sets the filter to the concept), else the line "K of these are in the focused concept". The notes of the concept move to the top of the list and have an accent bar. The other notes stay in the list and are faded. Point at a node, or move the keyboard focus to it, to mark its notes in the list without a change of order.
- Below 700 px of width, the visible panels (filters, diagram, notes) stack in this order and the view scrolls. The panel toggles work as in the wide layout. The handles are hidden and the stored widths have no effect.

The view does not show the properties of a single note. Use the Table layout of Bases for this.

## How to read the lattice

- The lattice shows recorded property values only.
- A missing value means "not annotated". It does not mean "false", and it does not mean that the note does not have the property.
- When all matching notes share a value, this is a fact about these records. It is not a rule about the domain.
- The full lattice is the set of all concepts of the data. The status line "Full lattice" shows its size. The diagram shows only a part: the concepts below the current filter, at most "Concepts in the diagram". When the part is smaller than the sub-lattice, the diagram shows the concepts with the most notes. Double-click a concept, or select it and use the link "Filter to these K", to see the concepts below it.
- The computation of the full lattice stops at the concept budget. Then the status line shows "more than N concepts (budget reached)".

## Sample vault

`test-vault/` has 14 notes about visualization techniques in `Techniques/`, with list properties `structure`, `data`, `task` and `interaction`. Five notes have nested tags with the parent paths `viz/family` and `viz/medium`, and one note has the flat tag `classic`. Some notes do not have values for all facets. `Visualization techniques.base` shows the notes of `Techniques/` with the layout "Concept lattice" (selected properties `structure`, `data`, `task`, `interaction`, `file.tags`) and as a table. `Not a technique.md` is outside `Techniques/`, so the filter of the base excludes it.

## Limitations

- The filter, the previous filters, the focus and the search are not saved in the `.base` file. They are lost when the view closes.
- Value comparison ignores case. `Tree` and `tree` are one value. The label is the first spelling that occurs.
- Links are compared by their display text, else by their target.
- An attribute id is `<facet>:<value>`. When a facet key contains `:`, two different values can get the same id.
- The diagram shows at most "Concepts in the diagram" concepts (`maxNodes`, default 20).
- The plugin does not show implications.
- The computation runs on the UI thread in time slices, not in a worker. `buildLattice` gives control to the event loop only between whole concepts. On a base with thousands of notes and hundreds of distinct values, one step can block the UI.
- The diagram part is computed on the UI thread for each filter change. While the lattice is hidden, the layout of the diagram is not computed; the displayed concepts are, because the notes column and the filter counts use them.
- The behavior in Obsidian is tested by hand, not by automated tests. The automated tests cover the FCA core, the Bases adapter with a mock of `obsidian`, and the pure view modules.
- The detection of error values from Bases is not verified against the Obsidian runtime.

## How it was made

An AI model wrote the code of this plugin: Claude Opus (Anthropic), from the prompt in [`prompt.md`](prompt.md). Cristian Vasquez wrote the prompt and directed the later changes, which AI coding agents also made. The prompt uses the first name of the plugin, Concept Atlas.

## License

MIT. See `LICENSE`.
