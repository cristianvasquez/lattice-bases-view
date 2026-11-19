import { describe, expect, it } from 'vitest';
import { DEFAULT_FACETS, resolveFacets } from '../src/bases';

describe('resolveFacets', () => {
  it('has the default facets', () => {
    expect(DEFAULT_FACETS).toEqual(['structure', 'data', 'task', 'interaction']);
  });

  it('keeps an input with a type prefix as the property id', () => {
    const { facets, warnings } = resolveFacets(['note.data', 'formula.score', 'file.folder'], []);
    expect(facets).toEqual([
      { key: 'data', propertyId: 'note.data' },
      { key: 'score', propertyId: 'formula.score' },
      { key: 'folder', propertyId: 'file.folder' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('makes an input without a prefix a note property, also when no note has it', () => {
    expect(resolveFacets(['task'], []).facets).toEqual([{ key: 'task', propertyId: 'note.task' }]);
    expect(resolveFacets(['task'], []).warnings).toEqual([]);
  });

  it('uses the formula only when the formula exists and the note property does not', () => {
    expect(resolveFacets(['score'], ['formula.score']).facets).toEqual([{ key: 'score', propertyId: 'formula.score' }]);
    expect(resolveFacets(['score'], ['formula.score', 'note.score']).facets).toEqual([
      { key: 'score', propertyId: 'note.score' },
    ]);
  });

  it('keeps the first input when two inputs give the same key, with a warning', () => {
    const { facets, warnings } = resolveFacets(['data', 'formula.data'], []);
    expect(facets).toEqual([{ key: 'data', propertyId: 'note.data' }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('formula.data');
  });

  it('trims inputs and drops empty inputs', () => {
    const { facets, warnings } = resolveFacets(['  structure ', '', '   '], []);
    expect(facets).toEqual([{ key: 'structure', propertyId: 'note.structure' }]);
    expect(warnings).toEqual([]);
  });
});
