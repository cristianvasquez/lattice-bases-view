import { describe, expect, it } from 'vitest';
import { buildAtlasData, resolveFacets } from '../src/bases';
import { StringValue, ListValue } from 'obsidian';
import { buildModel, contextOf } from '../src/view/model';
import { initialState } from '../src/view/state';
import { assignLayers, countCrossings, layoutDiagram, orderLayers, type Edge } from '../src/view/layout';
import { entry } from './bases-helpers';

describe('assignLayers', () => {
  it('puts the start node in layer 0 and uses the longest path', () => {
    const edges: Edge[] = [
      [0, 1],
      [1, 2],
      [0, 2],
      [0, 3],
    ];
    expect(assignLayers(4, edges, 0)).toEqual([0, 1, 2, 1]);
  });

  it('throws for a cycle and for a start node with an upper neighbour', () => {
    expect(() => assignLayers(2, [[0, 1], [1, 0]])).toThrow(/cycle/);
    expect(() => assignLayers(2, [[1, 0]], 0)).toThrow(/upper neighbour/);
  });

  it('puts each cover edge of a displayed lattice into a lower layer', () => {
    const s = (t: string) => new StringValue(t);
    const list = (...items: string[]) => new ListValue(items.map(s));
    const { facets } = resolveFacets(['structure', 'data', 'task'], []);
    const data = buildAtlasData(
      [
        entry('T/A.md', { 'note.structure': list('tree', 'graph'), 'note.data': s('hierarchical') }),
        entry('T/B.md', { 'note.structure': s('graph'), 'note.data': list('network', 'text'), 'note.task': s('flow') }),
        entry('T/C.md', { 'note.structure': s('matrix'), 'note.data': s('network'), 'note.task': list('compare', 'flow') }),
        entry('T/D.md', { 'note.data': s('network'), 'note.task': s('overview') }),
        entry('T/E.md', { 'note.structure': s('tree'), 'note.task': s('overview') }),
      ],
      facets,
    );
    const m = buildModel(data, contextOf(data), initialState(), { maxNodes: 40 });
    expect(m.covers.length).toBeGreaterThan(0);
    expect(m.layout.layer[0]).toBe(0);
    for (const [u, l] of m.covers) expect(m.layout.layer[l]!).toBeGreaterThan(m.layout.layer[u]!);
    for (const [u, l] of m.covers) expect(m.layout.y[l]!).toBeGreaterThan(m.layout.y[u]!);
  });
});

describe('orderLayers', () => {
  it('removes a crossing with barycenter passes', () => {
    // 0 on top; 1, 2 in layer 1; 3, 4 in layer 2; edges 1-4 and 2-3 cross in index order.
    const edges: Edge[] = [
      [0, 1],
      [0, 2],
      [1, 4],
      [2, 3],
    ];
    const layer = assignLayers(5, edges);
    const initial = [[0], [1, 2], [3, 4]];
    expect(countCrossings(initial, layer, edges)).toBe(1);
    const ordered = orderLayers(layer, edges, 4);
    expect(countCrossings(ordered, layer, edges)).toBe(0);
    expect(ordered.map((row) => [...row].sort())).toEqual(initial);
  });
});

describe('layoutDiagram', () => {
  it('gives no overlap inside a layer and an empty layout for no nodes', () => {
    const edges: Edge[] = [
      [0, 1],
      [0, 2],
      [0, 3],
    ];
    const layout = layoutDiagram(4, edges);
    const xs = layout.layers[1]!.map((n) => layout.x[n]!);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(168);
    expect(layout.x[0]).toBeCloseTo(layout.width / 2);
    expect(layoutDiagram(0, [])).toMatchObject({ layers: [], width: 0, height: 0 });
  });
});
