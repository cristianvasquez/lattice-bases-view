// Display model of the view: filter groups with counts, the displayed part of the lattice and the notes column. Pure: no DOM.
import type { AtlasData } from '../bases';
import {
  type Concept,
  type Cover,
  type FormalContext,
  attributeIds,
  attributeSet,
  conceptOfAttributes,
  createContext,
  exploreBySupport,
  objectIds,
} from '../fca';
import { DEFAULT_LAYOUT, type Layout, layoutDiagram, maxNodesPerLayer, nodeWidthFor } from './layout';
import type { ViewState } from './state';
import { ZERO_SUPPORT_TEXT, countText, displayLabels, notesText, shorten, valueText } from './text';

export const LABEL_MAX = 24;

export interface FilterValue {
  id: string;
  /** Display label. Common leading folders of the facet are removed. */
  label: string;
  /** The value as recorded. */
  fullLabel: string;
  /** Number of matching notes if this value is added to the current filter. */
  count: number;
  selected: boolean;
  /** True when the count is 0 and the value is not selected. */
  disabled: boolean;
  /** True when the value is in B'' but not in B: all matching notes share it. */
  shared: boolean;
}

export interface FilterGroup {
  facet: string;
  /** Display name of the facet. */
  name: string;
  values: FilterValue[];
}

export interface DisplayNode {
  index: number;
  concept: Concept;
  /** Intent as attribute ids, in context order. */
  intent: string[];
  support: number;
  /** Values of the intent that no displayed upper neighbour has. */
  reduced: string[];
  /** Main text of the node (shortened). */
  label: string;
  /** Second line of the node, or '' for none. */
  sublabel: string;
  ariaLabel: string;
  isStart: boolean;
  zero: boolean;
  /** True for a node that adds no value to its displayed upper neighbours. The diagram draws it small, with only the number of notes. */
  compact: boolean;
}

export interface NoteRef {
  path: string;
  name: string;
}

export interface NoteItem extends NoteRef {
  /** True when the note is in the extent of the focused concept. */
  inConcept: boolean;
}

/** The focused concept as the notes column shows it. */
export interface FocusedConcept {
  index: number;
  support: number;
  intent: string[];
  /** True when the intent of the concept is different from the current filter. */
  canFilterTo: boolean;
}

/** The notes column at the right of the diagram. It always exists in an 'ok' model. */
export interface NotesColumn {
  /** Number of notes of the current filter (B'), before the search. With no filter: all notes. */
  total: number;
  filterActive: boolean;
  /** The search text without spaces at the start and the end. '' for no search. */
  search: string;
  /** The notes of the current filter whose name matches the search. With a focused concept, its notes come first; else the order of Bases. */
  items: NoteItem[];
  focus: FocusedConcept | null;
}

export type ModelKind = 'ok' | 'no-entries' | 'no-values';

export interface DisplayModel {
  kind: ModelKind;
  /** The state after the removal of ids that are not in the data or not displayed. */
  state: ViewState;
  /** Display names of the facets. */
  facets: string[];
  totalNotes: number;
  /** The cacheable part (filter groups, displayed lattice, layout). `null` for an empty state. */
  part: DiagramPart | null;
  groups: FilterGroup[];
  /** Intent B'' of the current concept (B', B''). */
  currentIntent: string[];
  currentSupport: number;
  filterActive: boolean;
  /** Displayed part of the lattice: nodes[0] is the current concept. */
  nodes: DisplayNode[];
  covers: Cover[];
  truncated: boolean;
  /** Width of the nodes that are not compact, from the labels of the displayed part. */
  nodeWidth: number;
  /** The largest number of nodes per layer, from the viewport width (Infinity: no limit). */
  maxPerLayer: number;
  /** Computed on the first read (from the part, for `maxPerLayer`). */
  readonly layout: Layout;
  focusIndex: number | null;
  notes: NotesColumn | null;
}

/** The formal context of the atlas data: objects = paths, attributes = attribute ids. */
export function contextOf(data: AtlasData): FormalContext {
  return createContext(
    data.objects.map((o) => o.path),
    data.attributes.map((a) => a.id),
    data.incidence,
  );
}

/** True when the note name contains the search text (case-insensitive). An empty search matches all names. */
export function matchesSearch(name: string, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return needle === '' || name.toLowerCase().includes(needle);
}

function intentKey(ids: readonly string[]): string {
  return [...ids].sort().join('\u0000');
}

/** The display name of a facet: its name, else its key. */
export function facetName(facet: { key: string; name?: string }): string {
  return facet.name ?? facet.key;
}

/** Filter groups: one per facet, one value per attribute, with the count of matching notes if the value is added to the filter. */
export function filterGroups(data: AtlasData, ctx: FormalContext, selected: readonly string[], current: Concept): FilterGroup[] {
  const selectedSet = new Set(selected);
  // With support 0, B'' is the set of all attributes. "Shared by all matching notes" would then be true only because no note matches.
  const intent = new Set(current.support > 0 ? attributeIds(ctx, current.intent) : []);
  const display = displayLabels(data.attributes);
  return data.facets.map((facet) => ({
    facet: facet.key,
    name: facetName(facet),
    values: data.attributes
      .filter((a) => a.facet === facet.key)
      .map((a) => {
        const m = ctx.attributeIndex.get(a.id)!;
        const count = current.extent.and(ctx.attributeColumns[m]!).count();
        const isSelected = selectedSet.has(a.id);
        return {
          id: a.id,
          label: display.get(a.id) ?? a.label,
          fullLabel: a.label,
          count,
          selected: isSelected,
          disabled: count === 0 && !isSelected,
          shared: intent.has(a.id) && !isSelected,
        };
      }),
  }));
}

function emptyLayout(): Layout {
  return { nodeWidth: DEFAULT_LAYOUT.nodeWidth, maxPerLayer: Infinity, layer: [], layers: [], x: [], y: [], width: 0, height: 0 };
}

export interface ModelOptions {
  maxNodes: number;
  /** A part from an earlier call. It is used again when its key is equal; else a new part is computed. */
  part?: DiagramPart | null;
  /** Width of the diagram viewport in px. It sets the largest number of nodes per layer. Missing or 0: no limit. */
  viewportWidth?: number;
}

/** The parts of the model that depend only on the data, the filter and `maxNodes`: not on the focus or the search. */
export interface DiagramPart {
  key: string;
  selected: string[];
  current: Concept;
  filterActive: boolean;
  groups: FilterGroup[];
  nodes: DisplayNode[];
  covers: Cover[];
  truncated: boolean;
  /** Width of the nodes that are not compact: the estimated width of their longest label (see `nodeWidthFor`). */
  nodeWidth: number;
  /** The layout for at most `maxPerLayer` nodes per layer. Computed on the first call for each value and kept. */
  layoutFor(maxPerLayer: number): Layout;
}

/** The cache key of a diagram part. The part is valid only for the data that it was computed from. */
export function partKey(selected: readonly string[], maxNodes: number): string {
  return `${maxNodes}\u0001${intentKey(selected)}`;
}

/** Computes the filter groups, the displayed part of the lattice and its layout. Needs at least one object and one attribute. */
export function buildDiagramPart(data: AtlasData, ctx: FormalContext, selectedIds: readonly string[], maxNodes: number): DiagramPart {
  const display = displayLabels(data.attributes);
  const nameOf = new Map(data.facets.map((f) => [f.key, facetName(f)]));
  const labelOf = new Map(data.attributes.map((a) => [a.id, valueText(nameOf.get(a.facet) ?? a.facet, display.get(a.id) ?? a.label)]));
  const selected = selectedIds.filter((id) => ctx.attributeIndex.has(id));
  const current = conceptOfAttributes(ctx, attributeSet(ctx, selected));
  const filterActive = selected.length > 0;
  const explored = exploreBySupport(ctx, current, Math.max(1, Math.floor(maxNodes)));

  const intents = explored.concepts.map((c) => attributeIds(ctx, c.intent));
  const uppers: number[][] = explored.concepts.map(() => []);
  for (const [u, l] of explored.covers) uppers[l]!.push(u);

  const nodes: DisplayNode[] = explored.concepts.map((concept, index) => {
    const intent = intents[index]!;
    const above = new Set(uppers[index]!.flatMap((u) => intents[u]!));
    const reduced = intent.filter((id) => !above.has(id));
    const isStart = index === 0;
    const zero = concept.support === 0;
    const values = intent.map((id) => labelOf.get(id) ?? id);
    let label: string;
    let sublabel = '';
    let compact = false;
    if (zero) {
      label = ZERO_SUPPORT_TEXT;
      sublabel = notesText(concept.support);
    } else if (isStart && !filterActive) label = `All ${notesText(concept.support)}`;
    else if (reduced.length > 0) label = `${shorten(reduced.map((id) => labelOf.get(id) ?? id).join(', '), LABEL_MAX)} ${countText(concept.support)}`;
    else {
      label = countText(concept.support);
      compact = true;
    }
    const ariaValues = values.length > 0 ? `Values: ${values.join(', ')}` : 'No shared values';
    const ariaLabel = `${zero ? `${ZERO_SUPPORT_TEXT}. ` : ''}${notesText(concept.support)}. ${ariaValues}.`;
    return { index, concept, intent, support: concept.support, reduced, label, sublabel, ariaLabel, isStart, zero, compact };
  });

  const nodeWidth = nodeWidthFor(nodes.filter((n) => !n.compact).flatMap((n) => (n.sublabel === '' ? [n.label] : [n.label, n.sublabel])));
  const options = { ...DEFAULT_LAYOUT, nodeWidth };
  const support = nodes.map((n) => n.support);
  // The layout is computed on the first read, so that a view with the lattice hidden does not compute it.
  const layouts = new Map<number, Layout>();
  return {
    key: partKey(selected, maxNodes),
    selected,
    current,
    filterActive,
    groups: filterGroups(data, ctx, selected, current),
    nodes,
    covers: explored.covers,
    truncated: explored.truncated,
    nodeWidth,
    layoutFor(maxPerLayer: number): Layout {
      let layout = layouts.get(maxPerLayer);
      if (!layout) {
        layout = layoutDiagram(nodes.length, explored.covers, 0, options, maxPerLayer, support);
        layouts.set(maxPerLayer, layout);
      }
      return layout;
    },
  };
}

/** Builds the display model. `ctx` must be `contextOf(data)`. */
export function buildModel(data: AtlasData, ctx: FormalContext, state: ViewState, options: ModelOptions): DisplayModel {
  const facets = data.facets.map(facetName);

  if (data.objects.length === 0 || data.attributes.length === 0) {
    return {
      kind: data.objects.length === 0 ? 'no-entries' : 'no-values',
      state: { ...state, selected: [], focus: null },
      facets,
      totalNotes: data.objects.length,
      part: null,
      groups: [],
      currentIntent: [],
      currentSupport: data.objects.length,
      filterActive: false,
      nodes: [],
      covers: [],
      truncated: false,
      nodeWidth: DEFAULT_LAYOUT.nodeWidth,
      maxPerLayer: Infinity,
      layout: emptyLayout(),
      focusIndex: null,
      notes: null,
    };
  }

  const cached = options.part;
  const part =
    cached && cached.key === partKey(state.selected.filter((id) => ctx.attributeIndex.has(id)), options.maxNodes)
      ? cached
      : buildDiagramPart(data, ctx, state.selected, options.maxNodes);
  const { selected, nodes } = part;
  const maxPerLayer = maxNodesPerLayer(options.viewportWidth ?? 0, part.nodeWidth);

  let focusIndex: number | null = null;
  if (state.focus !== null) {
    const key = intentKey(state.focus);
    const found = nodes.findIndex((n) => intentKey(n.intent) === key);
    focusIndex = found >= 0 ? found : null;
  }

  const focusNode = focusIndex === null ? null : nodes[focusIndex]!;
  const inFilter = part.current.extent;
  const inConcept = focusNode?.concept.extent ?? null;
  const all: NoteItem[] = [];
  // Object index g of `ctx` is index g of `data.objects` (see contextOf).
  data.objects.forEach((o, g) => {
    if (inFilter.has(g) && matchesSearch(o.name, state.search)) all.push({ path: o.path, name: o.name, inConcept: inConcept?.has(g) ?? false });
  });
  // A stable order: the notes of the focused concept first, each group in the order of Bases.
  const items = inConcept ? [...all.filter((n) => n.inConcept), ...all.filter((n) => !n.inConcept)] : all;
  const notes: NotesColumn = {
    total: part.current.support,
    filterActive: part.filterActive,
    search: state.search.trim(),
    items,
    focus: focusNode && {
      index: focusNode.index,
      support: focusNode.support,
      intent: focusNode.intent,
      canFilterTo: intentKey(selected) !== intentKey(focusNode.intent),
    },
  };

  return {
    kind: 'ok',
    state: { ...state, selected, focus: focusIndex === null ? null : nodes[focusIndex]!.intent },
    facets,
    totalNotes: data.objects.length,
    part,
    groups: part.groups,
    currentIntent: nodes[0]!.intent,
    currentSupport: part.current.support,
    filterActive: part.filterActive,
    nodes,
    covers: part.covers,
    truncated: part.truncated,
    nodeWidth: part.nodeWidth,
    maxPerLayer,
    get layout(): Layout {
      return part.layoutFor(maxPerLayer);
    },
    focusIndex,
    notes,
  };
}

/** The paths of the notes of a displayed node. `ctx` must be the context of the model. */
export function nodeNotePaths(ctx: FormalContext, node: DisplayNode): Set<string> {
  return new Set(objectIds(ctx, node.concept.extent));
}

export interface NodesAbove {
  /** The node and all nodes from which it can be reached through the cover edges, in ascending order. */
  nodes: number[];
  /** The cover edges with both ends in `nodes`. */
  edges: Cover[];
}

/** The node `index`, all displayed nodes above it and the cover edges between these nodes. The union of their reduced labels is the intent of the node. */
export function nodesAbove(covers: readonly Cover[], index: number): NodesAbove {
  const uppers = new Map<number, number[]>();
  for (const [u, l] of covers) {
    const list = uppers.get(l);
    if (list) list.push(u);
    else uppers.set(l, [u]);
  }
  const seen = new Set<number>([index]);
  const stack = [index];
  while (stack.length > 0) {
    for (const u of uppers.get(stack.pop()!) ?? []) {
      if (!seen.has(u)) {
        seen.add(u);
        stack.push(u);
      }
    }
  }
  return {
    nodes: [...seen].sort((a, b) => a - b),
    edges: covers.filter(([u, l]) => seen.has(u) && seen.has(l)),
  };
}

/** Neighbour of a node for keyboard moves: the displayed upper or lower neighbour with the nearest x, or the next node in the layer. */
export function neighbourFor(model: DisplayModel, index: number, direction: 'up' | 'down' | 'left' | 'right'): number | null {
  const { layout, covers } = model;
  if (index < 0 || index >= model.nodes.length) return null;
  if (direction === 'left' || direction === 'right') {
    const row = layout.layers[layout.layer[index]!]!;
    const at = row.indexOf(index) + (direction === 'left' ? -1 : 1);
    return at >= 0 && at < row.length ? row[at]! : null;
  }
  const candidates = covers.filter(([u, l]) => (direction === 'up' ? l === index : u === index)).map(([u, l]) => (direction === 'up' ? u : l));
  if (candidates.length === 0) return null;
  const x = layout.x[index]!;
  return candidates.reduce((best, c) => (Math.abs(layout.x[c]! - x) < Math.abs(layout.x[best]! - x) ? c : best));
}
