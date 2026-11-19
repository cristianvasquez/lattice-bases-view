Build a complete Obsidian plugin called **Concept Atlas** that adds a **Concept lattice** layout to Obsidian Bases. Deliver the full editable codebase and a working build, not just a mockup or implementation plan.

**My use case**

I have hundreds of Markdown notes about visualization techniques, with text and list properties such as:

- structure: tree, dag, graph, matrix, canvas
- data: network, quantitative, categorical, temporal, hierarchical, text
- task: overview, compare, relationship, flow, navigate, distribution
- interaction: zoom, select, filter, brush

Properties are NOT exclusive. A technique can have multiple values within each facet. Missing properties mean unannotated, not confirmed false.

The browser prototype is a visual reference:
https://visualization-concept-atlas.cristianvasque443217.chatgpt.site

Do not depend on access to that site or its source. Build a self-contained plugin.

**Bases integration**

Check the current official Obsidian documentation and installed TypeScript API before implementing:
https://docs.obsidian.md/plugins/guides/bases-view

Use the supported custom Bases view API: registerBasesView, BasesView, onDataUpdated, and evaluated entry values. Work from the entries supplied by Bases so its filters and formulas are respected. Do not parse a .base file as though it contains the note data.

Let me configure which note or formula properties become lattice facets. Default to structure, data, task, and interaction. Preserve list values as separate attributes, for example data:network and data:quantitative. Use stable file paths as object identities.

**Interface**

Create a working exploration surface inside Bases:

1. Checkbox filters for property values. Multiple selections mean AND.
2. A layered concept diagram: general above, specific below.
3. Clickable concepts showing shared properties and matching notes.
4. A technique inspector showing recorded properties and unannotated facets.
5. Note links that open the actual Markdown file.
6. Search by note name, clear filters, and useful empty/error states.

Use Obsidian theme variables and scope all styles to the plugin. Support keyboard interaction and resizing. Keep the initial view manageable through local concept navigation or a clearly bounded overview.

**FCA engine**

Implement a UI-independent TypeScript module for object/attribute derivation, closure, concept enumeration, and Hasse cover relations. Use a correct algorithm such as Next Closure; verify it on small known contexts.

The lattice represents confirmed recorded attributes. Do not present empirical closures as guaranteed real-world implications. Do not treat a missing annotation as negative evidence. Explain this distinction briefly in the interface.

Handle the empty object set and zero-support bottom concept correctly. Distinguish the full mathematical lattice from any filtered or partial display.

Protect against concept explosion: use explicit budgets, cancellation or a worker where appropriate, and clear partial-result messaging. Never freeze Obsidian while enumerating. Clean up workers, listeners, and other resources when the view unloads.

No external server, telemetry, or AI extraction is needed for this first version. Keep data and computation local.

**Deliverables**

Create a normal TypeScript project with:

- Full source code, organized into FCA core, Bases adapter, and view.
- package.json, lockfile, TypeScript and build configuration.
- manifest.json and styles.css.
- Production main.js build.
- README with build, installation, usage, supported Obsidian version, and limitations.
- A sample .base file and 10–15 visualization notes with overlapping list properties and missing annotations.
- Meaningful FCA tests, including closure identities, known concepts, and cover edges.
- Instructions for future agents to build, test, and extend the project.

Inspect the available workspace and choose a suitable project directory. Develop and install in a separate test vault; do not modify my existing notes.

Build and run the relevant tests. If you can interact with Obsidian, test the custom layout, property updates, filters, list values, and note opening. Otherwise clearly distinguish verified checks from runtime checks I still need to perform.

Proceed with reasonable implementation decisions. Finish the codebase, then report its location, installation steps, validation results, and remaining limitations.
