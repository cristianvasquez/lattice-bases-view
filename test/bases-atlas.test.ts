import { LinkValue, ListValue, NullValue, StringValue } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { buildAtlasData, facetsFromProperties, resolveFacets, splitTag } from '../src/bases';
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

describe('splitTag', () => {
  it('removes one leading # and gives a flat tag for one segment', () => {
    expect(splitTag('#python')).toEqual({ value: 'python' });
    expect(splitTag('python')).toEqual({ value: 'python' });
    expect(splitTag('##python')).toEqual({ value: '#python' });
  });

  it('gives no value when there is no segment', () => {
    expect(splitTag('')).toBeUndefined();
    expect(splitTag('#')).toBeUndefined();
    expect(splitTag('#//')).toBeUndefined();
  });

  it('ignores empty segments', () => {
    expect(splitTag('/python/')).toEqual({ value: 'python' });
    expect(splitTag('#pimo//language/python/')).toEqual({ parent: 'pimo/language', value: 'python' });
  });

  it('gives the parent path and the last segment for three and four segments', () => {
    expect(splitTag('pimo/language/python')).toEqual({ parent: 'pimo/language', value: 'python' });
    expect(splitTag('#Pimo/Language/Python')).toEqual({ parent: 'Pimo/Language', value: 'Python' });
    expect(splitTag('a/b/c/d')).toEqual({ parent: 'a/b/c', value: 'd' });
    expect(splitTag('viz/family')).toEqual({ parent: 'viz', value: 'family' });
  });
});

describe('buildAtlasData with nested tags', () => {
  const tagFacets = facetsFromProperties(['note.structure', 'file.tags']).facets;

  it('makes a nested tag an attribute of a derived facet and omits the tags facet with no flat tag', () => {
    const data = buildAtlasData(
      [
        entry('T/A.md', { 'file.tags': list('#pimo/language/python', '#viz/medium/screen') }),
        entry('T/B.md', { 'file.tags': list('pimo/language/rust'), 'note.structure': s('tree') }),
      ],
      tagFacets,
    );
    expect(data.facets).toEqual([
      { key: 'structure', propertyId: 'note.structure' },
      { key: '#pimo/language', propertyId: 'file.tags', tags: true, name: 'language' },
      { key: '#viz/medium', propertyId: 'file.tags', tags: true, name: 'medium' },
    ]);
    expect(data.attributes).toEqual([
      { id: 'structure:tree', facet: 'structure', label: 'tree' },
      { id: '#pimo/language:python', facet: '#pimo/language', label: 'python' },
      { id: '#pimo/language:rust', facet: '#pimo/language', label: 'rust' },
      { id: '#viz/medium:screen', facet: '#viz/medium', label: 'screen' },
    ]);
    expect(data.incidence).toEqual([
      ['T/A.md', '#pimo/language:python'],
      ['T/A.md', '#viz/medium:screen'],
      ['T/B.md', 'structure:tree'],
      ['T/B.md', '#pimo/language:rust'],
    ]);
    expect(data.objects[0]?.attributes).toEqual({
      structure: [],
      '#pimo/language': ['#pimo/language:python'],
      '#viz/medium': ['#viz/medium:screen'],
    });
    expect(data.objects[0]?.unannotated).toEqual(['structure']);
    expect(data.objects[1]?.unannotated).toEqual(['#viz/medium']);
    expect(data.warnings).toEqual([]);
  });

  it('folds the case of the parent path and of the value, and keeps the first spelling', () => {
    const data = buildAtlasData(
      [entry('T/A.md', { 'file.tags': list('Pimo/Language/Python') }), entry('T/B.md', { 'file.tags': list('pimo/language/python') })],
      tagFacets,
    );
    expect(data.facets.map((f) => [f.key, f.name])).toEqual([
      ['structure', undefined],
      ['#pimo/language', 'Language'],
    ]);
    expect(data.attributes).toEqual([{ id: '#pimo/language:python', facet: '#pimo/language', label: 'Python' }]);
    expect(data.incidence).toEqual([
      ['T/A.md', '#pimo/language:python'],
      ['T/B.md', '#pimo/language:python'],
    ]);
  });

  it('keeps the tags facet for flat tags, before its derived facets, and adds no ancestor tags', () => {
    const data = buildAtlasData(
      [entry('T/A.md', { 'file.tags': list('#draft', '#pimo/language/python') }), entry('T/B.md', { 'file.tags': list('viz/family/tree') })],
      tagFacets,
    );
    expect(data.facets.map((f) => f.key)).toEqual(['structure', 'tags', '#pimo/language', '#viz/family']);
    expect(data.attributes.map((a) => a.id)).toEqual(['tags:draft', '#pimo/language:python', '#viz/family:tree']);
    expect(data.attributes[0]?.label).toBe('draft');
    expect(data.objects[0]?.attributes['tags']).toEqual(['tags:draft']);
    expect(data.objects[1]?.attributes['tags']).toEqual([]);
    expect(data.objects[1]?.unannotated).toEqual(['structure', 'tags', '#pimo/language']);
    expect(data.objects[0]?.unannotated).toEqual(['structure', '#viz/family']);
  });

  it('keeps the tags facet when a note has an error for it, and the note is not annotated for each derived facet', () => {
    const data = buildAtlasData(
      [entry('T/A.md', { 'file.tags': new FakeErrorValue('Bad') }), entry('T/B.md', { 'file.tags': list('pimo/language/python') })],
      tagFacets,
    );
    expect(data.facets.map((f) => f.key)).toEqual(['structure', 'tags', '#pimo/language']);
    expect(data.objects[0]?.errors).toEqual(['tags']);
    expect(data.objects[0]?.unannotated).toEqual(['structure', 'tags', '#pimo/language']);
    expect(data.objects[0]?.attributes['#pimo/language']).toEqual([]);
    expect(data.warnings).toHaveLength(1);
    expect(data.warnings[0]).toContain('"tags"');
  });

  it('marks notes with no tags as not annotated for each derived facet', () => {
    const data = buildAtlasData(
      [entry('T/A.md', {}), entry('T/B.md', { 'file.tags': list('viz/family/tree') })],
      tagFacets,
    );
    expect(data.facets.map((f) => f.key)).toEqual(['structure', '#viz/family']);
    expect(data.objects[0]?.attributes).toEqual({ structure: [], '#viz/family': [] });
    expect(data.objects[0]?.unannotated).toEqual(['structure', '#viz/family']);
    expect(data.incidence).toEqual([['T/B.md', '#viz/family:tree']]);
  });

  it('gives a derived facet its key as name when its name collides with another derived facet', () => {
    const data = buildAtlasData([entry('T/A.md', { 'file.tags': list('a/language/python', 'b/Language/rust', 'c/medium/x') })], tagFacets);
    expect(data.facets.map((f) => [f.key, f.name])).toEqual([
      ['structure', undefined],
      ['#a/language', '#a/language'],
      ['#b/language', '#b/language'],
      ['#c/medium', 'medium'],
    ]);
  });

  it('gives a derived facet its key as name when its name collides with a property facet', () => {
    const facets = facetsFromProperties(['note.language', 'note.medium', 'file.tags'], (id) => (id === 'note.medium' ? 'Medium' : '')).facets;
    const data = buildAtlasData(
      [entry('T/A.md', { 'note.language': s('python'), 'file.tags': list('pimo/language/python', 'viz/medium/screen', 'viz/family/tree') })],
      facets,
    );
    expect(data.facets.map((f) => [f.key, f.name])).toEqual([
      ['language', undefined],
      ['medium', 'Medium'],
      ['#pimo/language', '#pimo/language'],
      ['#viz/family', 'family'],
      ['#viz/medium', '#viz/medium'],
    ]);
    expect(data.attributes.map((a) => a.id)).toEqual([
      'language:python',
      '#pimo/language:python',
      '#viz/family:tree',
      '#viz/medium:screen',
    ]);
  });

  it('treats note.tags like file.tags', () => {
    const data = buildAtlasData([entry('T/A.md', { 'note.tags': list('#viz/family/tree') })], facetsFromProperties(['note.tags']).facets);
    expect(data.facets).toEqual([{ key: '#viz/family', propertyId: 'note.tags', tags: true, name: 'family' }]);
    expect(data.incidence).toEqual([['T/A.md', '#viz/family:tree']]);
  });

  it('does not split a value of a facet without the tags flag', () => {
    const data = buildAtlasData([entry('T/A.md', { 'note.structure': s('a/b/c') })], tagFacets);
    expect(data.attributes.map((a) => a.id)).toEqual(['structure:a/b/c']);
  });
});
