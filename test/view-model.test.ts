import { ListValue, StringValue } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { buildAtlasData, resolveFacets, type AtlasData } from '../src/bases';
import { buildModel, contextOf, matchesSearch, neighbourFor, nodeNotePaths, nodesAbove, type DisplayModel } from '../src/view/model';
import type { Cover } from '../src/fca';
import { backFilter, clearFilters, filterToConcept, initialState, reconcileState, setFocus, setSearch, toggleValue, type ViewState } from '../src/view/state';
import { entry } from './bases-helpers';

const s = (text: string) => new StringValue(text);
const list = (...items: string[]) => new ListValue(items.map(s));
const { facets } = resolveFacets(['structure', 'data', 'task'], []);

// a: tree / hierarchical / overview; b: tree+graph / network+hierarchical; c: graph / network / relationship; d: network only.
function sample(): AtlasData {
  return buildAtlasData(
    [
      entry('T/Arc.md', { 'note.structure': s('tree'), 'note.data': s('hierarchical'), 'note.task': s('overview') }),
      entry('T/Bubble.md', { 'note.structure': list('tree', 'graph'), 'note.data': list('network', 'hierarchical') }),
      entry('T/Chord.md', { 'note.structure': s('graph'), 'note.data': s('network'), 'note.task': s('relationship') }),
      entry('T/Dot.md', { 'note.data': s('network') }),
    ],
    facets,
  );
}

function model(state: ViewState, data = sample(), maxNodes = 40): DisplayModel {
  return buildModel(data, contextOf(data), state, { maxNodes });
}

function counts(m: DisplayModel): Record<string, number> {
  return Object.fromEntries(m.groups.flatMap((g) => g.values.map((v) => [v.id, v.count])));
}

function names(m: DisplayModel): string[] {
  return m.notes!.items.map((n) => n.name);
}

function marked(m: DisplayModel): string[] {
  return m.notes!.items.filter((n) => n.inConcept).map((n) => n.name);
}

function value(m: DisplayModel, id: string) {
  return m.groups.flatMap((g) => g.values).find((v) => v.id === id)!;
}

describe('filter counts', () => {
  it('counts the matching notes if the value is added to the filter', () => {
    const m = model(toggleValue(initialState(), 'data:network'));
    expect(m.currentSupport).toBe(3);
    expect(counts(m)).toEqual({
      'structure:graph': 2,
      'structure:tree': 1,
      'data:hierarchical': 1,
      'data:network': 3,
      'task:overview': 0,
      'task:relationship': 1,
    });
    expect(value(m, 'task:overview').disabled).toBe(true);
    expect(value(m, 'data:network').disabled).toBe(false);
  });

  it('counts all notes with no filter', () => {
    const m = model(initialState());
    expect(m.filterActive).toBe(false);
    expect(counts(m)['data:network']).toBe(3);
    expect(m.nodes[0]!.label).toBe('All 4 notes');
  });

  it('does not disable a selected value with count 0', () => {
    const m = model({ ...initialState(), selected: ['task:overview', 'task:relationship'] });
    expect(m.currentSupport).toBe(0);
    expect(value(m, 'task:overview').disabled).toBe(false);
    expect(value(m, 'task:overview').selected).toBe(true);
    expect(m.groups.flatMap((g) => g.values).some((v) => v.shared)).toBe(false);
  });
});

describe('AND semantics', () => {
  it('matches only the notes that have all selected values', () => {
    let state = toggleValue(initialState(), 'structure:graph');
    state = toggleValue(state, 'data:hierarchical');
    const m = model(state);
    expect(m.currentSupport).toBe(1);
    expect(m.notes!.items.map((n) => n.path)).toEqual(['T/Bubble.md']);
  });

  it('removes a value when it is toggled again', () => {
    const state = toggleValue(toggleValue(initialState(), 'structure:graph'), 'structure:graph');
    expect(state.selected).toEqual([]);
  });
});

describe('current concept', () => {
  it('marks the values of B\'\' that are not in B as shared', () => {
    const m = model(toggleValue(initialState(), 'structure:graph'));
    expect(m.currentIntent).toEqual(['structure:graph', 'data:network']);
    expect(value(m, 'data:network').shared).toBe(true);
    expect(value(m, 'structure:graph').shared).toBe(false);
    expect(value(m, 'structure:tree').shared).toBe(false);
  });

  it('starts the diagram at the current concept', () => {
    const m = model(toggleValue(initialState(), 'structure:graph'));
    expect(m.nodes[0]!.intent).toEqual(m.currentIntent);
    expect(m.nodes[0]!.support).toBe(2);
  });

  it('shows a zero-support concept with its own text', () => {
    const m = model(initialState());
    const zero = m.nodes.filter((n) => n.zero);
    expect(zero).toHaveLength(1);
    expect(zero[0]!.label).toBe('No note has all of these values');
  });

  it('gives the reduced label: values that no displayed upper neighbour has', () => {
    const m = model(initialState());
    const graphNetwork = m.nodes.find((n) => n.intent.join() === 'structure:graph,data:network')!;
    expect(graphNetwork.reduced).toEqual(['structure:graph']);
    expect(graphNetwork.label).toBe('structure: graph (2)');
    expect(graphNetwork.sublabel).toBe('');
    expect(graphNetwork.ariaLabel).toBe('2 notes. Values: structure: graph, data: network.');
  });
});

describe('compact nodes', () => {
  it('draws a node without an own value as a compact node with only the number of notes', () => {
    const m = model(initialState());
    const bubble = m.nodes.find((n) => n.support === 1 && n.intent.length === 4)!;
    expect(bubble.reduced).toEqual([]);
    expect(bubble.compact).toBe(true);
    expect(bubble.label).toBe('(1)');
    expect(bubble.sublabel).toBe('');
    expect(bubble.ariaLabel).toBe('1 note. Values: structure: graph, structure: tree, data: hierarchical, data: network.');
    for (const n of m.nodes.filter((n) => !n.compact)) expect(n.reduced.length > 0 || n.isStart || n.zero).toBe(true);
    expect(m.nodes.some((n) => n.label.includes('Combines'))).toBe(false);
  });

  it('keeps the text of the start node and of the zero-support node', () => {
    const m = model(initialState());
    expect(m.nodes[0]!.compact).toBe(false);
    expect(m.nodes[0]!.label).toBe('All 4 notes');
    const zero = m.nodes.find((n) => n.zero)!;
    expect(zero.compact).toBe(false);
    expect(zero.label).toBe('No note has all of these values');
    expect(zero.sublabel).toBe('0 notes');
  });
});

describe('nodesAbove', () => {
  // 0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3, 2 -> 4, 3 -> 5.
  const covers: Cover[] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
    [2, 4],
    [3, 5],
  ];

  it('gives only the start node for the start node', () => {
    expect(nodesAbove(covers, 0)).toEqual({ nodes: [0], edges: [] });
  });

  it('gives both branches up to the start node for a node with two upper neighbours', () => {
    const above = nodesAbove(covers, 3);
    expect(above.nodes).toEqual([0, 1, 2, 3]);
    expect(above.edges).toEqual([
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it('leaves out the nodes that are not above and gives only edges with both ends in the set', () => {
    const above = nodesAbove(covers, 5);
    expect(above.nodes).toEqual([0, 1, 2, 3, 5]);
    expect(above.nodes).not.toContain(4);
    const set = new Set(above.nodes);
    for (const [u, l] of above.edges) expect(set.has(u) && set.has(l)).toBe(true);
    expect(above.edges).not.toContainEqual([2, 4]);
  });

  it('gives the union of the reduced labels as the intent in the model', () => {
    const m = model(initialState());
    for (const node of m.nodes.filter((n) => !n.zero)) {
      const values = new Set(nodesAbove(m.covers, node.index).nodes.flatMap((i) => m.nodes[i]!.reduced));
      expect([...values].sort()).toEqual([...node.intent].sort());
    }
  });
});

describe('search', () => {
  it('filters the note list but does not change the concept set', () => {
    const plain = model(initialState());
    const searched = model(setSearch(initialState(), 'CH'));
    expect(searched.nodes.map((n) => n.intent)).toEqual(plain.nodes.map((n) => n.intent));
    expect(searched.covers).toEqual(plain.covers);
    expect(searched.groups).toEqual(plain.groups);
    expect(names(searched)).toEqual(['Chord']);
    expect(searched.notes!.total).toBe(4);
    expect(searched.notes!.search).toBe('CH');
  });

  it('matches a case-insensitive substring', () => {
    expect(matchesSearch('Node-link diagram', 'LINK')).toBe(true);
    expect(matchesSearch('Heatmap', 'tree')).toBe(false);
    expect(matchesSearch('Heatmap', '  ')).toBe(true);
  });
});

describe('notes column', () => {
  it('lists all notes in the order of Bases with no filter', () => {
    const m = model(initialState());
    expect(names(m)).toEqual(['Arc', 'Bubble', 'Chord', 'Dot']);
    expect(m.notes).toMatchObject({ total: 4, filterActive: false, search: '', focus: null });
    expect(marked(m)).toEqual([]);
  });

  it("lists the notes of the filter (B')", () => {
    const m = model(toggleValue(initialState(), 'structure:graph'));
    expect(names(m)).toEqual(['Bubble', 'Chord']);
    expect(m.notes).toMatchObject({ total: 2, filterActive: true });
  });

  it('reduces the list with the search and does not change the concepts', () => {
    const plain = model(toggleValue(initialState(), 'data:network'));
    const m = model(setSearch(toggleValue(initialState(), 'data:network'), ' o '));
    expect(names(m)).toEqual(['Chord', 'Dot']);
    expect(m.notes).toMatchObject({ total: 3, search: 'o' });
    expect(m.nodes.map((n) => n.intent)).toEqual(plain.nodes.map((n) => n.intent));
    expect(model(setSearch(initialState(), 'zzz')).notes!.items).toEqual([]);
  });

  it('puts the notes of the focused concept first, marks them and keeps the other notes of the filter', () => {
    const plain = model(initialState());
    const target = plain.nodes.find((n) => n.intent.join() === 'structure:graph,data:network')!;
    const m = model(setFocus(initialState(), target.intent));
    expect(names(m)).toEqual(['Bubble', 'Chord', 'Arc', 'Dot']);
    expect(marked(m)).toEqual(['Bubble', 'Chord']);
    expect(m.notes!.focus).toMatchObject({ index: target.index, support: 2, canFilterTo: true });
    // The search applies to both groups.
    expect(names(model(setSearch(setFocus(initialState(), target.intent), 'r')))).toEqual(['Chord', 'Arc']);
    // No focus: the order of Bases again.
    expect(names(model(setFocus(m.state, null)))).toEqual(['Arc', 'Bubble', 'Chord', 'Dot']);
  });

  it('gives the paths of the notes of a node for the marks on hover', () => {
    const data = sample();
    const ctx = contextOf(data);
    const m = buildModel(data, ctx, initialState(), { maxNodes: 40 });
    const target = m.nodes.find((n) => n.intent.join() === 'data:network')!;
    expect([...nodeNotePaths(ctx, target)]).toEqual(['T/Bubble.md', 'T/Chord.md', 'T/Dot.md']);
  });
});

describe('focus', () => {
  it('gives the focused concept to the notes column and filters to its intent', () => {
    const plain = model(initialState());
    const target = plain.nodes.find((n) => n.intent.join() === 'data:network')!;
    const m = model(setFocus(initialState(), target.intent));
    expect(m.focusIndex).toBe(target.index);
    expect(m.notes!.focus).toMatchObject({ index: target.index, support: 3, intent: ['data:network'], canFilterTo: true });
    const filtered = filterToConcept(m.state, m.notes!.focus!.intent);
    expect(filtered.focus).toBeNull();
    expect(model(filtered).currentSupport).toBe(3);
    // The focused concept equals the filter: no button "Filter to this concept".
    expect(model(setFocus(filtered, m.notes!.focus!.intent)).notes!.focus!.canFilterTo).toBe(false);
    // The start node with no filter is the concept of all notes.
    expect(model(setFocus(initialState(), [])).notes!.focus).toMatchObject({ index: 0, support: 4, canFilterTo: false });
  });

  it('drops a focus that is not displayed', () => {
    const m = model(setFocus(toggleValue(initialState(), 'structure:tree'), ['task:relationship']));
    expect(m.focusIndex).toBeNull();
    expect(m.state.focus).toBeNull();
  });

  it('moves to an upper or lower neighbour and inside a layer', () => {
    const m = model(initialState());
    const lower = neighbourFor(m, 0, 'down');
    expect(lower).not.toBeNull();
    expect(m.covers).toContainEqual([0, lower!]);
    expect(neighbourFor(m, lower!, 'up')).toBe(0);
    expect(neighbourFor(m, 0, 'up')).toBeNull();
    const row = m.layout.layers[1]!;
    if (row.length > 1) expect(neighbourFor(m, row[0]!, 'right')).toBe(row[1]);
  });

  it('computes the layout on the first read and keeps it in the part', () => {
    const m = model(initialState());
    const layout = m.layout;
    expect(m.layout).toBe(layout);
    expect(m.part!.layout).toBe(layout);
    expect(layout.layer.length).toBe(m.nodes.length);
  });

  it('clears the filter, the search and the focus', () => {
    const state = setFocus(setSearch(toggleValue(initialState(), 'data:network'), 'x'), []);
    expect(clearFilters(state)).toEqual({ selected: [], focus: null, search: '', previous: [] });
  });
});

describe('stack of previous filters', () => {
  it('pushes the previous filter when it filters to a concept, and back restores it', () => {
    const start = toggleValue(initialState(), 'data:network');
    const down = filterToConcept(setFocus(start, ['data:network', 'structure:graph']), ['data:network', 'structure:graph']);
    expect(down).toMatchObject({ selected: ['data:network', 'structure:graph'], focus: null, previous: [['data:network']] });
    const back = backFilter(setFocus(down, ['data:network', 'structure:graph']));
    expect(back).toMatchObject({ selected: ['data:network'], focus: null, previous: [] });
  });

  it('goes back two levels one by one', () => {
    const one = filterToConcept(initialState(), ['data:network']);
    const two = filterToConcept(one, ['data:network', 'structure:graph']);
    expect(two.previous).toEqual([[], ['data:network']]);
    const back1 = backFilter(two);
    expect(back1).toMatchObject({ selected: ['data:network'], previous: [[]] });
    const back2 = backFilter(back1);
    expect(back2).toMatchObject({ selected: [], previous: [] });
  });

  it('empties the stack on a checkbox change and on "Clear filters"', () => {
    const down = filterToConcept(filterToConcept(initialState(), ['data:network']), ['data:network', 'structure:graph']);
    expect(toggleValue(down, 'task:relationship').previous).toEqual([]);
    expect(toggleValue(down, 'structure:graph').previous).toEqual([]);
    expect(clearFilters(down).previous).toEqual([]);
  });

  it('changes nothing on back with an empty stack', () => {
    const state = setFocus(toggleValue(initialState(), 'data:network'), ['data:network']);
    expect(backFilter(state)).toBe(state);
  });

  it('keeps the stack through the model and drops ids that no longer exist', () => {
    const down = filterToConcept(initialState(), ['data:network']);
    expect(model(down).state.previous).toEqual([[]]);
    const stale: ViewState = { ...initialState(), previous: [['data:gone', 'data:network']] };
    expect(reconcileState(stale, sample()).previous).toEqual([['data:network']]);
  });
});

describe('data updates', () => {
  it('keeps the state when the ids exist and drops ids that no longer exist', () => {
    const state: ViewState = {
      selected: ['data:network', 'structure:graph'],
      focus: ['structure:graph', 'data:network'],
      search: 'dot',
      previous: [],
    };
    expect(reconcileState(state, sample())).toEqual({ ...state, selected: ['structure:graph', 'data:network'] });

    const changed = buildAtlasData(
      [
        entry('T/Arc.md', { 'note.structure': s('tree'), 'note.data': s('network') }),
        entry('T/Dot.md', { 'note.data': s('network') }),
      ],
      facets,
    );
    expect(reconcileState(state, changed)).toEqual({ selected: ['data:network'], focus: null, search: 'dot', previous: [] });
  });
});

describe('empty states', () => {
  it('gives the no-entries model when Bases gives no entries', () => {
    const data = buildAtlasData([], facets);
    const m = model(toggleValue(initialState(), 'data:network'), data);
    expect(m.kind).toBe('no-entries');
    expect(m.nodes).toEqual([]);
    expect(m.groups).toEqual([]);
    expect(m.notes).toBeNull();
    expect(m.totalNotes).toBe(0);
    expect(m.state.selected).toEqual([]);
  });

  it('gives the no-values model when no configured facet has a value', () => {
    const data = buildAtlasData([entry('T/Arc.md', {})], facets);
    const m = model(initialState(), data);
    expect(m.kind).toBe('no-values');
    expect(m.facets).toEqual(['structure', 'data', 'task']);
  });
});

describe('diagram part cache', () => {
  it('uses the part again for a search or focus change and computes a new part for a filter change', () => {
    const data = sample();
    const ctx = contextOf(data);
    const first = buildModel(data, ctx, initialState(), { maxNodes: 40 });
    const searched = buildModel(data, ctx, setFocus(setSearch(initialState(), 'dot'), []), { maxNodes: 40, part: first.part });
    expect(searched.part).toBe(first.part);
    expect(names(searched)).toEqual(['Dot']);
    const filtered = buildModel(data, ctx, toggleValue(initialState(), 'data:network'), { maxNodes: 40, part: first.part });
    expect(filtered.part).not.toBe(first.part);
    expect(filtered.currentSupport).toBe(3);
    const smaller = buildModel(data, ctx, initialState(), { maxNodes: 10, part: first.part });
    expect(smaller.part).not.toBe(first.part);
  });
});

describe('diagram budget', () => {
  it('marks the displayed part as truncated when the budget is smaller than the sub-lattice', () => {
    const m = model(initialState(), sample(), 2);
    expect(m.nodes).toHaveLength(2);
    expect(m.truncated).toBe(true);
  });
});
