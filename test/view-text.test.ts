import { describe, expect, it } from 'vitest';
import { readLegacyFacets, readViewConfig, viewFacets } from '../src/view/config';
import { displayLabels, shortPathLabels } from '../src/view/text';
import { EXPLANATION, HIGHLIGHT_HINT, NO_FACETS_TEXT, NO_FILTER_MATCH_TEXT, errorText, filterToText, focusCountText, fullLatticeText, noValuesText, notesCountText, shorten, shownText } from '../src/view/text';

describe('status text', () => {
  it('separates the full lattice from the displayed part', () => {
    expect(fullLatticeText({ kind: 'running' })).toBe('Full lattice: Computing…');
    expect(fullLatticeText({ kind: 'complete', count: 12 })).toBe('Full lattice: 12 concepts');
    expect(fullLatticeText({ kind: 'budget', count: 5000 })).toBe('Full lattice: more than 5000 concepts (budget reached)');
    expect(shownText(7, false)).toBe('Shown: 7 concepts below the current filter');
    expect(shownText(40, true)).toContain("the 40 concepts with the most notes; double-click a concept to see below it");
  });

  it('names the configured facets in the no-values text and never says "does not have"', () => {
    expect(noValuesText(['structure', 'data'])).toContain('"structure", "data"');
    for (const text of [EXPLANATION, noValuesText(['x']), noValuesText([])]) expect(text).not.toMatch(/does not have/i);
    expect(EXPLANATION).toContain("not annotated");
  });

  it('asks for selected properties when no facet is usable, and never names the removed option', () => {
    expect(noValuesText([])).toBe(
      'Select the properties to compare in the Properties menu of this base. The Concept lattice groups the notes by the values of these properties.',
    );
    expect(noValuesText([])).toBe(NO_FACETS_TEXT);
    for (const text of [noValuesText([]), noValuesText(['x']), errorText('boom')]) {
      expect(text).toContain('Properties menu');
      expect(text).not.toContain('Facet properties');
    }
  });

  it('gives the reading rule of the highlight', () => {
    expect(HIGHLIGHT_HINT).toBe('Point at a concept to see its values above it. Double-click to filter to it; use Back to return.');
  });

  it('shortens long labels with an ellipsis', () => {
    expect(shorten('short', 10)).toBe('short');
    expect(shorten('structure: graph, data: network', 12)).toBe('structure:…');
  });
});

describe('notes column text', () => {
  it('gives the count line with and without a filter and a search', () => {
    expect(notesCountText(14, false, null)).toBe('14 notes');
    expect(notesCountText(5, true, null)).toBe('5 notes match the filter');
    expect(notesCountText(1, true, null)).toBe('1 note matches the filter');
    expect(notesCountText(5, true, 2)).toBe('5 notes match the filter, 2 shown');
    expect(notesCountText(14, false, 0)).toBe('14 notes, 0 shown');
  });

  it('gives the line of the focused concept', () => {
    expect(focusCountText(3)).toBe('3 of these are in the focused concept');
    expect(focusCountText(1)).toBe('1 of these is in the focused concept');
    expect(filterToText(4)).toBe('Filter to these 4');
    expect(filterToText(1)).toBe('Filter to this 1');
  });

  it('does not say that a note does not have a value', () => {
    expect(NO_FILTER_MATCH_TEXT).not.toMatch(/does not have/i);
  });
});

describe('readViewConfig', () => {
  it('gives the defaults for missing values and clamps numbers', () => {
    expect(readViewConfig(() => undefined)).toEqual({ maxConcepts: 5000, maxNodes: 20 });
    const values: Record<string, unknown> = { facets: ['task', 'formula.kind'], maxConcepts: 999999, maxNodes: '3' };
    expect(readViewConfig((k) => values[k])).toEqual({ maxConcepts: 20000, maxNodes: 10 });
  });
});

describe('readLegacyFacets', () => {
  it('reads a list or a comma-separated text, else gives an empty list', () => {
    expect(readLegacyFacets(['task', 3, 'formula.kind'])).toEqual(['task', 'formula.kind']);
    expect(readLegacyFacets(' task, data ,,')).toEqual(['task', 'data']);
    expect(readLegacyFacets(undefined)).toEqual([]);
    expect(readLegacyFacets(null)).toEqual([]);
    expect(readLegacyFacets(5)).toEqual([]);
  });
});

describe('viewFacets', () => {
  const displayName = (id: string) => id.slice(id.indexOf('.') + 1).toUpperCase();

  it('uses the selected properties with their display names and ignores the earlier option', () => {
    const { facets } = viewFacets({ order: ['file.name', 'note.task', 'file.folder'], displayName, legacy: ['data'], allProperties: [] });
    expect(facets).toEqual([
      { key: 'task', propertyId: 'note.task', name: 'TASK' },
      { key: 'folder', propertyId: 'file.folder', name: 'FOLDER' },
    ]);
  });

  it('uses the stored option of an earlier version when no selected property is usable', () => {
    const { facets } = viewFacets({ order: ['file.name'], displayName, legacy: ['data', 'score'], allProperties: ['formula.score'] });
    expect(facets).toEqual([
      { key: 'data', propertyId: 'note.data' },
      { key: 'score', propertyId: 'formula.score' },
    ]);
  });

  it('gives no facet when no property is selected and there is no earlier option', () => {
    expect(viewFacets({ order: [], displayName, legacy: undefined, allProperties: ['note.data'] })).toEqual({ facets: [], warnings: [] });
  });
});

describe('short path labels', () => {
  it('removes the common leading folders', () => {
    expect(shortPathLabels(['a/b', 'a/b/c', 'a/b/d e'])).toEqual(['b/', 'c', 'd e']);
    expect(shortPathLabels(['x/one', 'x/two'])).toEqual(['one', 'two']);
  });
  it('keeps labels that are not paths, single labels and labels with no common folder', () => {
    expect(shortPathLabels(['tree', 'graph'])).toEqual(['tree', 'graph']);
    expect(shortPathLabels(['a/b'])).toEqual(['a/b']);
    expect(shortPathLabels(['a/b', 'c/d'])).toEqual(['a/b', 'c/d']);
    expect(shortPathLabels(['a/b', 'tree'])).toEqual(['a/b', 'tree']);
  });
  it('keeps the labels when the short labels are not unique', () => {
    expect(shortPathLabels(['a/b', 'a/b/b/'])).toEqual(['a/b', 'a/b/b/']);
  });
  it('works per facet', () => {
    const m = displayLabels([
      { id: 'folder:a/b/c', facet: 'folder', label: 'a/b/c' },
      { id: 'folder:a/b/d', facet: 'folder', label: 'a/b/d' },
      { id: 'tags:a/b', facet: 'tags', label: 'a/b' },
    ]);
    expect([...m.values()]).toEqual(['c', 'd', 'a/b']);
  });
});
