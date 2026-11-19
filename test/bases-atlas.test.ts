import { LinkValue, ListValue, NullValue, StringValue } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { buildAtlasData, resolveFacets } from '../src/bases';
import { entry, FakeErrorValue } from './bases-helpers';

const s = (text: string) => new StringValue(text);
const list = (...items: string[]) => new ListValue(items.map(s));
const { facets } = resolveFacets(['structure', 'data', 'task', 'interaction'], []);

describe('buildAtlasData', () => {
  it('makes each list value a separate attribute', () => {
    const data = buildAtlasData([entry('T/Sankey.md', { 'note.data': list('network', 'quantitative') })], facets);
    expect(data.attributes).toEqual([
      { id: 'data:network', facet: 'data', label: 'network' },
      { id: 'data:quantitative', facet: 'data', label: 'quantitative' },
    ]);
    expect(data.incidence).toEqual([
      ['T/Sankey.md', 'data:network'],
      ['T/Sankey.md', 'data:quantitative'],
    ]);
    expect(data.objects[0]?.attributes['data']).toEqual(['data:network', 'data:quantitative']);
  });

  it('makes a text value one attribute', () => {
    const data = buildAtlasData([entry('T/Treemap.md', { 'note.structure': s('tree') })], facets);
    expect(data.attributes.map((a) => a.id)).toEqual(['structure:tree']);
  });

  it('records missing, null, empty text and empty list as unannotated, with no attribute', () => {
    const data = buildAtlasData(
      [entry('T/A.md', { 'note.structure': null, 'note.data': NullValue.value, 'note.task': s(''), 'note.interaction': new ListValue([]) })],
      facets,
    );
    expect(data.attributes).toEqual([]);
    expect(data.incidence).toEqual([]);
    expect(data.objects[0]?.unannotated).toEqual(['structure', 'data', 'task', 'interaction']);
    expect(data.objects[0]?.errors).toEqual([]);
  });

  it('makes an error value unannotated with an error, no attribute and one warning per facet', () => {
    const data = buildAtlasData(
      [
        entry('T/A.md', { 'note.task': new FakeErrorValue('Bad formula') }),
        entry('T/B.md', { 'note.task': new FakeErrorValue('Bad formula'), 'note.data': list('text') }),
      ],
      facets,
    );
    expect(data.attributes.map((a) => a.id)).toEqual(['data:text']);
    expect(data.objects[0]?.errors).toEqual(['task']);
    expect(data.objects[0]?.unannotated).toContain('task');
    expect(data.warnings).toHaveLength(1);
    expect(data.warnings[0]).toContain('task');
    expect(data.warnings[0]).toContain('2 notes');
  });

  it('folds case in the attribute id and keeps the first spelling as label', () => {
    const data = buildAtlasData(
      [entry('T/A.md', { 'note.data': list('Network') }), entry('T/B.md', { 'note.data': list('network') })],
      facets,
    );
    expect(data.attributes).toEqual([{ id: 'data:network', facet: 'data', label: 'Network' }]);
    expect(data.incidence).toEqual([
      ['T/A.md', 'data:network'],
      ['T/B.md', 'data:network'],
    ]);
  });

  it('gives an attribute one time when a note has the same value two times', () => {
    const data = buildAtlasData([entry('T/A.md', { 'note.task': list('compare', 'Compare', 'compare') })], facets);
    expect(data.incidence).toEqual([['T/A.md', 'task:compare']]);
    expect(data.objects[0]?.attributes['task']).toEqual(['task:compare']);
  });

  it('flattens a nested list and converts links', () => {
    const value = new ListValue([s('tree'), new ListValue([new LinkValue('[[Graphs|graph]]')])]);
    const data = buildAtlasData([entry('T/A.md', { 'note.structure': value })], facets);
    expect(data.attributes.map((a) => a.id)).toEqual(['structure:graph', 'structure:tree']);
  });

  it('orders attributes by facet order, then by label', () => {
    const data = buildAtlasData(
      [entry('T/A.md', { 'note.task': list('overview', 'compare'), 'note.structure': list('tree', 'Dag') })],
      facets,
    );
    expect(data.attributes.map((a) => a.id)).toEqual(['structure:dag', 'structure:tree', 'task:compare', 'task:overview']);
  });

  it('keeps the entry order and uses the path as identity', () => {
    const data = buildAtlasData([entry('T/Zeta.md', {}), entry('T/Alpha.md', {})], facets);
    expect(data.objects.map((o) => [o.path, o.name])).toEqual([
      ['T/Zeta.md', 'Zeta'],
      ['T/Alpha.md', 'Alpha'],
    ]);
  });

  it('keeps two notes with the same basename in different folders as two objects', () => {
    const data = buildAtlasData(
      [entry('A/Heatmap.md', { 'note.data': list('quantitative') }), entry('B/Heatmap.md', { 'note.data': list('quantitative') })],
      facets,
    );
    expect(data.objects.map((o) => o.path)).toEqual(['A/Heatmap.md', 'B/Heatmap.md']);
    expect(data.objects.map((o) => o.name)).toEqual(['Heatmap', 'Heatmap']);
    expect(data.incidence).toEqual([
      ['A/Heatmap.md', 'data:quantitative'],
      ['B/Heatmap.md', 'data:quantitative'],
    ]);
  });
});
