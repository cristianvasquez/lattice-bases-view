import { describe, expect, it } from 'vitest';
import { buildAtlasData, resolveFacets } from '../src/bases';
import { StringValue, ListValue } from 'obsidian';
import { buildModel, contextOf } from '../src/view/model';
import { initialState } from '../src/view/state';
import {
  DEFAULT_LAYOUT,
  DIAGRAM_PAD,
  MIN_FIT_SCALE,
  MIN_NODE_WIDTH,
  assignLayers,
  assignLayersBounded,
  countCrossings,
  fitTransform,
  layoutDiagram,
  maxNodesPerLayer,
  nodeWidthFor,
  orderLayers,
  type Edge,
} from '../src/view/layout';
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

/** A pseudo-random generator with a seed (mulberry32), so that a failed test can be repeated. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random DAG in which node 0 is the only node with no upper neighbour, as in a displayed lattice. */
function randomDag(rand: () => number, count: number): Edge[] {
  const edges: Edge[] = [];
  for (let l = 1; l < count; l++) {
    const uppers = new Set<number>([Math.floor(rand() * l)]);
    for (let u = 0; u < l; u++) if (rand() < 0.15) uppers.add(u);
    for (const u of uppers) edges.push([u, l]);
  }
  return edges;
}

describe('assignLayersBounded', () => {
  const widths = [1, 2, 3, 5, 8];

  it('puts each edge into a lower layer and at most W nodes into a layer, with the start node alone in layer 0', () => {
    const rand = random(42);
    for (let trial = 0; trial < 60; trial++) {
      const count = 1 + Math.floor(rand() * 30);
      const edges = randomDag(rand, count);
      const priority = Array.from({ length: count }, () => Math.floor(rand() * 10));
      for (const w of widths) {
        const layer = assignLayersBounded(count, edges, 0, w, priority);
        for (const [u, l] of edges) expect(layer[l]!).toBeGreaterThan(layer[u]!);
        const sizes = new Map<number, number>();
        for (const k of layer) sizes.set(k, (sizes.get(k) ?? 0) + 1);
        for (const size of sizes.values()) expect(size).toBeLessThanOrEqual(w);
        expect(layer[0]).toBe(0);
        expect(sizes.get(0)).toBe(1);
      }
    }
  });

  it('is equal to assignLayers with W = Infinity', () => {
    const rand = random(7);
    for (let trial = 0; trial < 40; trial++) {
      const count = 1 + Math.floor(rand() * 30);
      const edges = randomDag(rand, count);
      expect(assignLayersBounded(count, edges, 0, Infinity)).toEqual(assignLayers(count, edges, 0));
    }
  });

  it('gives one node per layer with W = 1', () => {
    const rand = random(3);
    for (let trial = 0; trial < 20; trial++) {
      const count = 1 + Math.floor(rand() * 20);
      const layer = assignLayersBounded(count, randomDag(rand, count), 0, 1);
      expect([...layer].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });

  it('uses the larger priority, then the lower index, as the tie rule', () => {
    const edges: Edge[] = [
      [0, 1],
      [0, 2],
      [0, 3],
    ];
    expect(assignLayersBounded(4, edges, 0, 2)).toEqual([0, 1, 1, 2]);
    expect(assignLayersBounded(4, edges, 0, 2, [4, 1, 2, 3])).toEqual([0, 2, 1, 1]);
  });

  it('throws for W < 1', () => {
    expect(() => assignLayersBounded(2, [[0, 1]], 0, 0)).toThrow(RangeError);
  });
});

describe('maxNodesPerLayer and nodeWidthFor', () => {
  it('computes W from the viewport width at scale 1', () => {
    // (width - 2 * 24 + 24) / (168 + 24)
    expect(maxNodesPerLayer(400, 168)).toBe(1);
    expect(maxNodesPerLayer(800, 168)).toBe(4);
    expect(maxNodesPerLayer(1600, 168)).toBe(8);
    expect(maxNodesPerLayer(4 * 192 - 24 + 2 * DIAGRAM_PAD, 168)).toBe(4);
    expect(maxNodesPerLayer(4 * 192 - 25 + 2 * DIAGRAM_PAD, 168)).toBe(3);
    expect(maxNodesPerLayer(800, 72)).toBe(8);
    expect(maxNodesPerLayer(10, 168)).toBe(1);
    expect(maxNodesPerLayer(0, 168)).toBe(Infinity);
    expect(maxNodesPerLayer(Number.NaN, 168)).toBe(Infinity);
  });

  it('gives the node width from the longest label, from the minimum to the maximum', () => {
    expect(nodeWidthFor([])).toBe(MIN_NODE_WIDTH);
    expect(nodeWidthFor(['(3)'])).toBe(MIN_NODE_WIDTH);
    expect(nodeWidthFor(['All 14 notes', '(3)'])).toBe(12 * 7 + 16);
    expect(nodeWidthFor(['x'.repeat(40)])).toBe(DEFAULT_LAYOUT.nodeWidth);
    expect(nodeWidthFor(['x'.repeat(40)], 120)).toBe(120);
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

  it('keeps the graph width inside the width of W nodes', () => {
    const rand = random(11);
    const options = { ...DEFAULT_LAYOUT, nodeWidth: 100 };
    for (let trial = 0; trial < 20; trial++) {
      const count = 2 + Math.floor(rand() * 30);
      const edges = randomDag(rand, count);
      for (const w of [1, 3, 6]) {
        const layout = layoutDiagram(count, edges, 0, options, w);
        expect(layout.nodeWidth).toBe(100);
        expect(layout.maxPerLayer).toBe(w);
        expect(layout.width).toBeLessThanOrEqual(w * 124 - 24);
        for (const [u, l] of edges) expect(layout.y[l]!).toBeGreaterThan(layout.y[u]!);
      }
    }
  });
});

describe('fitTransform', () => {
  const pad = 24;
  const finite = (t: { x: number; y: number; k: number }) => [t.x, t.y, t.k].every(Number.isFinite);

  it('shows a graph that fits the width at scale 1, top center, also when it is higher than the region', () => {
    const small = fitTransform({ width: 200, height: 100 }, { x: 100, y: 8 }, { width: 800, height: 600 }, pad);
    expect(small).toEqual({ x: 300, y: pad - 8, k: 1 });
    const tall = fitTransform({ width: 400, height: 5000 }, { x: 200, y: 8 }, { width: 800, height: 600 }, pad);
    expect(tall).toEqual({ x: 200, y: pad - 8, k: 1 });
  });

  it('scales a wider graph down to fit the width, but not below 0.7', () => {
    const t = fitTransform({ width: 1000, height: 400 }, { x: 500, y: 0 }, { width: 848, height: 600 }, pad);
    expect(t.k).toBeCloseTo(0.8);
    expect(t.x).toBeCloseTo((848 - 1000 * 0.8) / 2);
    expect(t.y).toBeCloseTo(pad);
  });

  it('uses scale 0.7 and puts the start node at the top center when the graph width does not fit at 0.7', () => {
    const graph = { width: 3048, height: 400 };
    const start = { x: 1600, y: 0 };
    const region = { width: 800, height: 600 };
    const t = fitTransform(graph, start, region, pad);
    expect(t.k).toBe(MIN_FIT_SCALE);
    expect(t.x + start.x * t.k).toBeCloseTo(region.width / 2);
    expect(t.y + start.y * t.k).toBeCloseTo(pad);
  });

  it('gives finite values for an empty region or an empty graph', () => {
    for (const region of [{ width: 0, height: 600 }, { width: 800, height: 0 }, { width: 0, height: 0 }]) {
      const t = fitTransform({ width: 1000, height: 400 }, { x: 500, y: 0 }, region, pad);
      expect(finite(t)).toBe(true);
      expect(t).toEqual({ x: pad, y: pad, k: 1 });
    }
    expect(fitTransform({ width: 0, height: 0 }, { x: 0, y: 0 }, { width: 800, height: 600 }, pad)).toEqual({ x: pad, y: pad, k: 1 });
    expect(finite(fitTransform({ width: 1000, height: 400 }, { x: 500, y: 0 }, { width: 30, height: 30 }, pad))).toBe(true);
  });
});
