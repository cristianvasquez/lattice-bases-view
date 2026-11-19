import { ListValue, StringValue } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { buildAtlasData, resolveFacets, type AtlasData } from '../src/bases';
import { buildModel, contextOf, matchesSearch, neighbourFor, type DisplayModel } from '../src/view/model';
import { clearFilters, filterToConcept, initialState, reconcileState, selectNote, setFocus, setSearch, toggleValue, type ViewState } from '../src/view/state';
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
  });
});

describe('AND semantics', () => {
  it('matches only the notes that have all selected values', () => {
    let state = toggleValue(initialState(), 'structure:graph');
    state = toggleValue(state, 'data:hierarchical');
    const m = model(state);
    expect(m.currentSupport).toBe(1);
    expect(m.details!.notes.map((n) => n.path)).toEqual(['T/Bubble.md']);
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
    expect(m.details!.isCurrent).toBe(true);
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
    expect(graphNetwork.label).toBe('structure: graph');
  });
});

describe('search', () => {
  it('filters the note list but does not change the concept set', () => {
    const plain = model(initialState());
    const searched = model(setSearch(initialState(), 'CH'));
    expect(searched.nodes.map((n) => n.intent)).toEqual(plain.nodes.map((n) => n.intent));
    expect(searched.covers).toEqual(plain.covers);
    expect(searched.groups).toEqual(plain.groups);
    expect(searched.details!.notes.map((n) => n.name)).toEqual(['Chord']);
    expect(searched.details!.support).toBe(4);
  });

  it('matches a case-insensitive substring', () => {
    expect(matchesSearch('Node-link diagram', 'LINK')).toBe(true);
    expect(matchesSearch('Heatmap', 'tree')).toBe(false);
    expect(matchesSearch('Heatmap', '  ')).toBe(true);
  });
});

describe('focus and details', () => {
  it('shows the focused concept in the details and filters to its intent', () => {
    const plain = model(initialState());
    const target = plain.nodes.find((n) => n.intent.join() === 'data:network')!;
    const m = model(setFocus(initialState(), target.intent));
    expect(m.focusIndex).toBe(target.index);
    expect(m.details!.isCurrent).toBe(false);
    expect(m.details!.support).toBe(3);
    expect(m.details!.shared).toEqual([{ facet: 'data', labels: ['network'] }]);
    const filtered = filterToConcept(m.state, m.details!.intent);
    expect(filtered.focus).toBeNull();
    expect(model(filtered).currentSupport).toBe(3);
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

  it('clears the filter, the search and the focus, but keeps the inspected note', () => {
    const state = selectNote(setFocus(setSearch(toggleValue(initialState(), 'data:network'), 'x'), []), 'T/Dot.md');
    expect(clearFilters(state)).toEqual({ selected: [], focus: null, search: '', selectedNote: 'T/Dot.md' });
  });
});

describe('inspector', () => {
  it('lists the recorded values and the facets that are not annotated', () => {
    const m = model(selectNote(initialState(), 'T/Dot.md'));
    expect(m.inspection).toEqual({
      path: 'T/Dot.md',
      name: 'Dot',
      recorded: [{ facet: 'data', labels: ['network'] }],
      notAnnotated: ['structure', 'task'],
    });
  });
});

describe('data updates', () => {
  it('keeps the state when the ids exist and drops ids that no longer exist', () => {
    const state: ViewState = {
      selected: ['data:network', 'structure:graph'],
      focus: ['structure:graph', 'data:network'],
      selectedNote: 'T/Chord.md',
      search: 'dot',
    };
    expect(reconcileState(state, sample())).toEqual({ ...state, selected: ['structure:graph', 'data:network'] });

    const changed = buildAtlasData(
      [
        entry('T/Arc.md', { 'note.structure': s('tree'), 'note.data': s('network') }),
        entry('T/Dot.md', { 'note.data': s('network') }),
      ],
      facets,
    );
    expect(reconcileState(state, changed)).toEqual({ selected: ['data:network'], focus: null, selectedNote: null, search: 'dot' });
  });
});

describe('empty states', () => {
  it('gives the no-entries model when Bases gives no entries', () => {
    const data = buildAtlasData([], facets);
    const m = model(toggleValue(initialState(), 'data:network'), data);
    expect(m.kind).toBe('no-entries');
    expect(m.nodes).toEqual([]);
    expect(m.groups).toEqual([]);
    expect(m.details).toBeNull();
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

describe('diagram budget', () => {
  it('marks the displayed part as truncated when the budget is smaller than the sub-lattice', () => {
    const m = model(initialState(), sample(), 2);
    expect(m.nodes).toHaveLength(2);
    expect(m.truncated).toBe(true);
  });
});
