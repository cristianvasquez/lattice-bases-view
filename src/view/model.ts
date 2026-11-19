// Display model of the view: filter groups with counts, the displayed part of the lattice, details and inspector. Pure: no DOM.
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
import { type Layout, layoutDiagram } from './layout';
import type { ViewState } from './state';
import { ZERO_SUPPORT_TEXT, notesText, shorten, valueText } from './text';

export const LABEL_MAX = 24;

export interface FilterValue {
  id: string;
  label: string;
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
}

export interface NoteRef {
  path: string;
  name: string;
}

export interface FacetValues {
  facet: string;
  labels: string[];
}

export interface ConceptDetails {
  /** Index of the node in `nodes`. 0 is the current concept. */
  index: number;
  isCurrent: boolean;
  support: number;
  intent: string[];
  shared: FacetValues[];
  /** Notes of the extent whose name matches the search. */
  notes: NoteRef[];
  /** True when the filter already equals the intent. */
  filterEqualsIntent: boolean;
}

export interface Inspection {
  path: string;
  name: string;
  recorded: FacetValues[];
  /** Facet keys with no recorded value in this note. */
  notAnnotated: string[];
}

export type ModelKind = 'ok' | 'no-entries' | 'no-values';

export interface DisplayModel {
  kind: ModelKind;
  /** The state after the removal of ids that are not in the data or not displayed. */
  state: ViewState;
  facets: string[];
  totalNotes: number;
  groups: FilterGroup[];
  /** Intent B'' of the current concept (B', B''). */
  currentIntent: string[];
  currentSupport: number;
  filterActive: boolean;
  /** Displayed part of the lattice: nodes[0] is the current concept. */
  nodes: DisplayNode[];
  covers: Cover[];
  truncated: boolean;
  layout: Layout;
  focusIndex: number | null;
  details: ConceptDetails | null;
  inspection: Inspection | null;
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

/** Groups attribute ids by facet, in the order of the facets. Facets without ids are left out. */
export function groupByFacet(data: AtlasData, ids: readonly string[]): FacetValues[] {
  const set = new Set(ids);
  const groups: FacetValues[] = [];
  for (const facet of data.facets) {
    const labels = data.attributes.filter((a) => a.facet === facet.key && set.has(a.id)).map((a) => a.label);
    if (labels.length > 0) groups.push({ facet: facet.key, labels });
  }
  return groups;
}

/** Filter groups: one per facet, one value per attribute, with the count of matching notes if the value is added to the filter. */
export function filterGroups(data: AtlasData, ctx: FormalContext, selected: readonly string[], current: Concept): FilterGroup[] {
  const selectedSet = new Set(selected);
  const intent = new Set(attributeIds(ctx, current.intent));
  return data.facets.map((facet) => ({
    facet: facet.key,
    values: data.attributes
      .filter((a) => a.facet === facet.key)
      .map((a) => {
        const m = ctx.attributeIndex.get(a.id)!;
        const count = current.extent.and(ctx.attributeColumns[m]!).count();
        const isSelected = selectedSet.has(a.id);
        return {
          id: a.id,
          label: a.label,
          count,
          selected: isSelected,
          disabled: count === 0 && !isSelected,
          shared: intent.has(a.id) && !isSelected,
        };
      }),
  }));
}

function emptyLayout(): Layout {
  return { layer: [], layers: [], x: [], y: [], width: 0, height: 0 };
}

export interface ModelOptions {
  maxNodes: number;
}

/** Builds the display model. `ctx` must be `contextOf(data)`. */
export function buildModel(data: AtlasData, ctx: FormalContext, state: ViewState, options: ModelOptions): DisplayModel {
  const facets = data.facets.map((f) => f.key);
  const labelOf = new Map(data.attributes.map((a) => [a.id, valueText(a.facet, a.label)]));
  const nameOf = new Map(data.objects.map((o) => [o.path, o.name]));
  const inspection = inspect(data, state.selectedNote);

  if (data.objects.length === 0 || data.attributes.length === 0) {
    return {
      kind: data.objects.length === 0 ? 'no-entries' : 'no-values',
      state: { ...state, selected: [], focus: null },
      facets,
      totalNotes: data.objects.length,
      groups: [],
      currentIntent: [],
      currentSupport: data.objects.length,
      filterActive: false,
      nodes: [],
      covers: [],
      truncated: false,
      layout: emptyLayout(),
      focusIndex: null,
      details: null,
      inspection,
    };
  }

  const selected = state.selected.filter((id) => ctx.attributeIndex.has(id));
  const current = conceptOfAttributes(ctx, attributeSet(ctx, selected));
  const filterActive = selected.length > 0;
  const explored = exploreBySupport(ctx, current, Math.max(1, Math.floor(options.maxNodes)));

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
    let sublabel = notesText(concept.support);
    if (zero) label = ZERO_SUPPORT_TEXT;
    else if (isStart && !filterActive) {
      label = `All ${notesText(concept.support)}`;
      sublabel = '';
    } else if (reduced.length > 0) label = shorten(reduced.map((id) => labelOf.get(id) ?? id).join(', '), LABEL_MAX);
    else label = 'Combines the values above';
    const ariaValues = values.length > 0 ? `Values: ${values.join(', ')}` : 'No shared values';
    const ariaLabel = `${zero ? `${ZERO_SUPPORT_TEXT}. ` : ''}${notesText(concept.support)}. ${ariaValues}.`;
    return { index, concept, intent, support: concept.support, reduced, label, sublabel, ariaLabel, isStart, zero };
  });

  let focusIndex: number | null = null;
  if (state.focus !== null) {
    const key = intentKey(state.focus);
    const found = nodes.findIndex((n) => intentKey(n.intent) === key);
    focusIndex = found >= 0 ? found : null;
  }

  const target = nodes[focusIndex ?? 0]!;
  const notes = objectIds(ctx, target.concept.extent)
    .map((path) => ({ path, name: nameOf.get(path) ?? path }))
    .filter((n) => matchesSearch(n.name, state.search));
  const details: ConceptDetails = {
    index: target.index,
    isCurrent: target.index === 0,
    support: target.support,
    intent: target.intent,
    shared: groupByFacet(data, target.intent),
    notes,
    filterEqualsIntent: intentKey(selected) === intentKey(target.intent),
  };

  return {
    kind: 'ok',
    state: { ...state, selected, focus: focusIndex === null ? null : nodes[focusIndex]!.intent },
    facets,
    totalNotes: data.objects.length,
    groups: filterGroups(data, ctx, selected, current),
    currentIntent: intents[0]!,
    currentSupport: current.support,
    filterActive,
    nodes,
    covers: explored.covers,
    truncated: explored.truncated,
    layout: layoutDiagram(nodes.length, explored.covers, 0),
    focusIndex,
    details,
    inspection,
  };
}

/** The recorded values per facet and the facets that are not annotated in the note. `null` when the path is not in the data. */
export function inspect(data: AtlasData, path: string | null): Inspection | null {
  if (path === null) return null;
  const object = data.objects.find((o) => o.path === path);
  if (!object) return null;
  const ids = Object.values(object.attributes).flat();
  return { path: object.path, name: object.name, recorded: groupByFacet(data, ids), notAnnotated: [...object.unannotated] };
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
