# Build Concept Atlas for Obsidian Bases

Build **Concept Atlas**, an Obsidian plugin that adds a **Concept lattice** view to Bases. Deliver the editable TypeScript project and a working production build.

## What I’m using it for

I have hundreds of Markdown notes about visualization techniques. I want to explore which techniques share attributes and drill down into more specific combinations. My notes use properties like these:

| Property | Example values |
|---|---|
| `structure` | tree, dag, graph, matrix, canvas |
| `data` | network, quantitative, categorical, temporal, hierarchical, text |
| `task` | overview, compare, relationship, flow, navigate, distribution |
| `interaction` | zoom, select, filter, brush |

A technique can have several values in the same property. A missing property means I haven’t annotated that facet.

Use [my browser prototype](https://visualization-concept-atlas.cristianvasque443217.chatgpt.site) as a visual reference if it’s accessible. The plugin must work independently of the site and its source.

## Bases integration

Before implementing, check the [official Bases view guide](https://docs.obsidian.md/plugins/guides/bases-view) and the installed Obsidian TypeScript declarations. Use the supported custom view API, including `registerBasesView`, `BasesView`, and `onDataUpdated`.

Build the lattice from the entries and evaluated values supplied to the view so it respects Bases filters and formulas. Use the `.base` file for view configuration. Let me choose which note properties or formulas become facets, with `structure`, `data`, `task`, and `interaction` selected by default. Treat each list value as a separate attribute, such as `data:network` and `data:quantitative`. Use the vault-relative file path as the object ID.

## The view

- Show attribute values as checkboxes. Combine selections with AND and provide a clear-filters action.
- Draw general concepts above specific ones. Keep the initial diagram manageable with local navigation or a bounded overview. Make it clear when the diagram shows only part of the lattice.
- When I select a concept, show its shared attributes and matching notes. Let me inspect a technique’s recorded values and see which facets are unannotated.
- Let me search by note name and open the actual Markdown file from the results or inspector.
- Use Obsidian theme variables and scope styles to the plugin. Make controls and concepts keyboard operable, handle pane resizing, and show useful messages for empty results and errors.

Add a short explanation in the view that the lattice shows patterns in recorded annotations. An unannotated facet provides no negative evidence, and an implication observed in these notes may not hold outside them.

## Formal concept analysis

Keep the FCA engine independent of the UI. Implement object-to-attribute and attribute-to-object derivation, closure, concept enumeration with Next Closure or an equivalent algorithm, and Hasse cover relations. Test against small contexts with known closures, concepts, and cover edges. Include cases for an empty object set and a bottom concept with zero supporting notes.

Set explicit computation budgets and keep enumeration and cover computation off the UI thread or split into cancellable work. Cancel stale work when inputs change and release workers, listeners, and other resources when the view unloads. If a budget is reached, label the result as partial. Distinguish the mathematical lattice for the current context from any subset shown in the diagram.

Keep the plugin local. It needs no external server, telemetry, or AI extraction.

## Deliverables and verification

Inspect the workspace and choose a project directory. Keep installation and runtime testing in a separate test vault so my existing notes stay untouched.

Include:

- TypeScript source organized into the FCA core, Bases adapter, and view.
- `package.json`, a lockfile, TypeScript and build configuration, `manifest.json`, `styles.css`, and a production `main.js`.
- A README covering build, installation, usage, minimum supported Obsidian version, and limitations.
- A sample `.base` file and 10–15 visualization notes with overlapping list values and some unannotated facets.
- FCA tests and maintainer instructions for building, testing, and extending the plugin.

Run the production build and tests. If Obsidian is available, install the plugin in the test vault and check that the custom view loads, property edits refresh the lattice, list values stay separate, filters work, and note links open the right files. In the handoff, give me the project location and installation steps, list the checks you ran, and identify any runtime checks still pending or limitations I’ll encounter.
