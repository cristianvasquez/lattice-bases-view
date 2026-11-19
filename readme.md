---
repo-uri: osg://repo/local:06642ecd189313f8e47c74dc22023513c63e8c39
tags: [repo/pkm]
---

# [lattices-plugin](osg://repo/local:06642ecd189313f8e47c74dc22023513c63e8c39)

## What it does

Concept Atlas adds the layout "Concept lattice" to Obsidian Bases. The layout computes a concept lattice (Formal Concept Analysis) from the values of the facet properties of the notes in the base. Each concept is a set of notes and the set of values that all these notes share.

## Supported Obsidian version

Obsidian 1.10.0 or later (`minAppVersion` in `manifest.json`). The core plugin Bases must be enabled. If Bases is not enabled, the plugin shows a notice and does not add the layout.

## Build

```sh
pnpm install
pnpm verify   # tsc --noEmit, vitest run, production build of main.js
pnpm build    # production build of main.js only
```

`pnpm verify` runs 10 test files with 95 tests.

## Installation

1. Build `main.js` with `pnpm build`.
2. Install into the test vault: `pnpm install:vault`. Install into another vault: `pnpm install:vault <vault path>`. The script copies `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/concept-atlas/`.
3. In Obsidian, open Settings → Community plugins and enable "Concept Atlas".

## Usage

Open a base. Add a view and select the layout "Concept lattice". The view uses only the notes that the filters and formulas of the base give.

View options:

| Option | Default | Range | Function |
| --- | --- | --- | --- |
| Facet properties | `structure`, `data`, `task`, `interaction` | | The properties that give the values. A name without a prefix is a note property, or a formula when only a formula with that name exists. You can also write `note.`, `formula.` or `file.` before the name. |
| Concept budget (full lattice) | 5000 | 500 to 20000, step 500 | The maximum number of concepts that the plugin computes for the full lattice. |
| Concepts in the diagram | 20 | 10 to 150, step 5 | The maximum number of concepts in the diagram. |

Parts of the view:

- Filters: one group of check boxes for each facet. Each value shows the number of matching notes. Selected values combine with AND. A value that all matching notes share has the mark "shared by all matching notes". A value that no matching note has is disabled. "Clear filters" removes the selected values, the search text and the focus.
- Diagram: the concepts below the current filter. Each node shows the values that it adds to the concepts above it, and its number of notes in parentheses, for example `interaction: select (6)`. A node that adds no value is small and shows only its number of notes, for example `(3)`. Point at a node, or move the keyboard focus to it: the diagram marks the node, all concepts above it and the edges between them. The values of the marked concepts together are the values of the node. The focused concept stays marked while the pointer is not on another node. Drag to move the diagram. Use the mouse wheel or the buttons `+` and `−` to zoom. "Fit" and the initial view use a scale from 0.7 to 1. When the diagram fits into the view at a scale of 0.7 or more, it is centered. Else the scale is 0.7 and the top concept is at the top center of the view; drag to see the rest. Click a node, or press Enter or Space on it, to focus it. The arrow keys move the focus to a neighbour node. Escape removes the focus.
- Selection panel: below the diagram. It shows only when the filter has a value, a concept is focused, or the search text is not empty. Else the diagram uses the full height. The panel shows "Focused concept" or "Current filter", the number of notes, the values that all these notes share (per facet), and the matching notes in columns. Click a note name to open the note (with Ctrl or Cmd: in a new tab). For a focused concept that is different from the current filter, "Filter to this concept" sets the filter to the values of the concept.
- Search: "Search note names" filters the note list of the selection panel by name. It does not change the lattice.

The view does not show the properties of a single note. Use the Table layout of Bases for this.

## How to read the lattice

- The lattice shows recorded property values only.
- A missing value means "not annotated". It does not mean "false", and it does not mean that the note does not have the property.
- When all matching notes share a value, this is a fact about these records. It is not a rule about the domain.
- The full lattice is the set of all concepts of the data. The status line "Full lattice" shows its size. The diagram shows only a part: the concepts below the current filter, at most "Concepts in the diagram". When the part is smaller than the sub-lattice, the diagram shows the concepts with the most notes. Select a concept and use "Filter to this concept" to see the concepts below it.
- The computation of the full lattice stops at the concept budget. Then the status line shows "more than N concepts (budget reached)".

## Sample vault

`test-vault/` has 14 notes about visualization techniques in `Techniques/`, with list properties `structure`, `data`, `task` and `interaction`. Some notes do not have values for all facets. `Visualization techniques.base` shows the notes of `Techniques/` with the layout "Concept lattice" and as a table. `Not a technique.md` is outside `Techniques/`, so the filter of the base excludes it.

## Limitations

- The filter, the focus and the search are not saved in the `.base` file. They are lost when the view closes.
- Value comparison ignores case. `Tree` and `tree` are one value. The label is the first spelling that occurs.
- Links are compared by their display text, else by their target.
- An attribute id is `<facet>:<value>`. When a facet key contains `:`, two different values can get the same id.
- The diagram shows at most "Concepts in the diagram" concepts (`maxNodes`, default 20).
- The plugin does not show implications.
- The computation runs on the UI thread in time slices, not in a worker. `buildLattice` gives control to the event loop only between whole concepts. On a base with thousands of notes and hundreds of distinct values, one step can block the UI.
- The diagram part is computed on the UI thread for each filter change.
- The behavior in Obsidian is tested by hand, not by automated tests. The automated tests cover the FCA core, the Bases adapter with a mock of `obsidian`, and the pure view modules.
- The detection of error values from Bases is not verified against the Obsidian runtime.
