import { describe, expect, it } from 'vitest';
import { facetsFromProperties, resolveFacets } from '../src/bases';

describe('resolveFacets', () => {
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

describe('facetsFromProperties', () => {
  it('keeps the selected properties in order, without the properties that identify one note', () => {
    const { facets, warnings } = facetsFromProperties([
      'file.name',
      'note.structure',
      'file.basename',
      'file.folder',
      'file.path',
      'formula.score',
      'file.file',
      'file.tags',
      'file.links',
    ]);
    expect(facets).toEqual([
      { key: 'structure', propertyId: 'note.structure' },
      { key: 'folder', propertyId: 'file.folder' },
      { key: 'score', propertyId: 'formula.score' },
      { key: 'tags', propertyId: 'file.tags' },
      { key: 'links', propertyId: 'file.links' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('gives the display name, and no name when the display name is empty', () => {
    const names: Record<string, string> = { 'note.data': 'Data type', 'file.folder': '  ' };
    const { facets } = facetsFromProperties(['note.data', 'file.folder'], (id) => names[id] ?? id);
    expect(facets).toEqual([
      { key: 'data', propertyId: 'note.data', name: 'Data type' },
      { key: 'folder', propertyId: 'file.folder' },
    ]);
  });

  it('keeps the first property when two properties give the same key, with a warning', () => {
    const { facets, warnings } = facetsFromProperties(['note.data', 'formula.data']);
    expect(facets).toEqual([{ key: 'data', propertyId: 'note.data' }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('formula.data');
  });

  it('gives no facet when only properties that identify one note are selected', () => {
    expect(facetsFromProperties(['file.name', 'file.path'])).toEqual({ facets: [], warnings: [] });
    expect(facetsFromProperties([])).toEqual({ facets: [], warnings: [] });
  });
});
