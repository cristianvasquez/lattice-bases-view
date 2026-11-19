// Layered layout of the displayed part of the lattice. Pure: no DOM.

/** A cover pair [upper, lower] of node indexes. */
export type Edge = readonly [upper: number, lower: number];

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  /** Horizontal space between two nodes of a layer. */
  gapX: number;
  /** Vertical space between two layers. */
  gapY: number;
  /** Number of barycenter passes (one pass = one sweep down and one sweep up). */
  passes: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = { nodeWidth: 168, nodeHeight: 48, gapX: 24, gapY: 64, passes: 4 };

/** Padding between the graph and the border of the diagram viewport, at scale 1. */
export const DIAGRAM_PAD = 24;
/** The smallest node width. The largest is `DEFAULT_LAYOUT.nodeWidth`. */
export const MIN_NODE_WIDTH = 72;
/** Estimated width of one character of a node label (interface font, small size). The pure code does not measure the DOM. */
export const LABEL_CHAR_WIDTH = 7;
/** Horizontal space in a node around its label: both sides together. */
export const LABEL_PADDING = 16;

/**
 * The node width for the given labels: the estimated width of the longest label, from MIN_NODE_WIDTH to `max`.
 * The estimate is the number of characters times LABEL_CHAR_WIDTH plus LABEL_PADDING.
 */
export function nodeWidthFor(labels: readonly string[], max = DEFAULT_LAYOUT.nodeWidth): number {
  const longest = labels.reduce((m, label) => Math.max(m, label.length), 0);
  return Math.min(max, Math.max(MIN_NODE_WIDTH, Math.ceil(longest * LABEL_CHAR_WIDTH + LABEL_PADDING)));
}

/**
 * The largest number of nodes per layer, so that a layer fits the viewport width at scale 1:
 * `max(1, floor((viewportWidth - 2 * pad + gapX) / (nodeWidth + gapX)))`.
 * A width that is not finite or not larger than 0 (a viewport with no size) gives Infinity: no limit.
 */
export function maxNodesPerLayer(viewportWidth: number, nodeWidth: number, gapX = DEFAULT_LAYOUT.gapX, pad = DIAGRAM_PAD): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return Infinity;
  return Math.max(1, Math.floor((viewportWidth - 2 * pad + gapX) / (nodeWidth + gapX)));
}

export interface Layout {
  /** Width of a node that is not compact. All nodes use a column grid with this width. */
  nodeWidth: number;
  /** The largest number of nodes per layer that was used (Infinity: no limit). */
  maxPerLayer: number;
  /** Layer of each node. 0 is the top layer. */
  layer: number[];
  /** Node indexes per layer, left to right. */
  layers: number[][];
  /** Center of each node. */
  x: number[];
  y: number[];
  width: number;
  height: number;
}

/**
 * Layer of each node: the length of the longest path from `start` along the edges (upper to lower). `start` is in layer 0.
 * A node that no edge reaches is in layer 0. Throws an Error when the edges have a cycle.
 */
export function assignLayers(count: number, edges: readonly Edge[], start = 0): number[] {
  const lowers: number[][] = Array.from({ length: count }, () => []);
  const indegree = new Array<number>(count).fill(0);
  for (const [u, l] of edges) {
    if (u < 0 || u >= count || l < 0 || l >= count) throw new RangeError(`Edge [${u}, ${l}] is out of range 0..${count - 1}`);
    lowers[u]!.push(l);
    indegree[l]!++;
  }
  const layer = new Array<number>(count).fill(0);
  const queue: number[] = [];
  for (let i = 0; i < count; i++) if (indegree[i] === 0) queue.push(i);
  let done = 0;
  while (queue.length > 0) {
    const u = queue.shift()!;
    done++;
    for (const l of lowers[u]!) {
      layer[l] = Math.max(layer[l]!, layer[u]! + 1);
      if (--indegree[l]! === 0) queue.push(l);
    }
  }
  if (done < count) throw new Error('The cover edges have a cycle');
  if (count > 0 && layer[start] !== 0) throw new Error(`The start node ${start} has an upper neighbour`);
  return layer;
}

/**
 * Layer of each node with at most `maxPerLayer` nodes per layer (W >= 1). For each edge the lower node is in a layer below the upper node.
 * The nodes are processed in topological order: the layer of `assignLayers` first, then the larger `priority` (for example the support),
 * then the lower index. Each node goes to the first layer that is below all its upper neighbours and has fewer than W nodes.
 * `start` is processed first. When all other nodes have an upper neighbour (as in a lattice), `start` is alone in layer 0.
 * With W = Infinity the result is equal to `assignLayers`. Long edges that pass over layers are permitted.
 */
export function assignLayersBounded(count: number, edges: readonly Edge[], start = 0, maxPerLayer = Infinity, priority?: readonly number[]): number[] {
  const longest = assignLayers(count, edges, start);
  if (!(maxPerLayer >= 1)) throw new RangeError(`The maximum number of nodes per layer must be 1 or more, not ${maxPerLayer}`);
  const uppers: number[][] = Array.from({ length: count }, () => []);
  for (const [u, l] of edges) uppers[l]!.push(u);
  const order = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) =>
      Number(b === start) - Number(a === start) ||
      longest[a]! - longest[b]! ||
      (priority?.[b] ?? 0) - (priority?.[a] ?? 0) ||
      a - b,
  );
  const layer = new Array<number>(count).fill(0);
  const size: number[] = [];
  for (const node of order) {
    let k = uppers[node]!.reduce((m, u) => Math.max(m, layer[u]! + 1), 0);
    while ((size[k] ?? 0) >= maxPerLayer) k++;
    layer[node] = k;
    size[k] = (size[k] ?? 0) + 1;
  }
  return layer;
}

/** Number of crossings between edges that connect two adjacent layers, for the given order of the layers. */
export function countCrossings(layers: readonly (readonly number[])[], layer: readonly number[], edges: readonly Edge[]): number {
  const position = new Map<number, number>();
  for (const row of layers) row.forEach((node, i) => position.set(node, i));
  const adjacent = edges.filter(([u, l]) => layer[l]! - layer[u]! === 1);
  let crossings = 0;
  for (let i = 0; i < adjacent.length; i++) {
    for (let j = i + 1; j < adjacent.length; j++) {
      const [u1, l1] = adjacent[i]!;
      const [u2, l2] = adjacent[j]!;
      if (layer[u1] !== layer[u2]) continue;
      const du = position.get(u1)! - position.get(u2)!;
      const dl = position.get(l1)! - position.get(l2)!;
      if (du * dl < 0) crossings++;
    }
  }
  return crossings;
}

/** Orders the nodes in each layer with barycenter sweeps. The initial order is the node index. Keeps the order with the fewest crossings. */
export function orderLayers(layer: readonly number[], edges: readonly Edge[], passes: number): number[][] {
  const depth = layer.reduce((m, l) => Math.max(m, l), -1) + 1;
  let layers: number[][] = Array.from({ length: depth }, () => []);
  layer.forEach((l, node) => layers[l]!.push(node));
  const uppers: number[][] = layer.map(() => []);
  const lowers: number[][] = layer.map(() => []);
  for (const [u, l] of edges) {
    lowers[u]!.push(l);
    uppers[l]!.push(u);
  }

  // Normalized position (0..1) of each node in its layer, so that edges that skip layers also count.
  const relative = (rows: number[][]): Map<number, number> => {
    const map = new Map<number, number>();
    for (const row of rows) row.forEach((node, i) => map.set(node, (i + 0.5) / row.length));
    return map;
  };
  const sweep = (rows: number[][], neighbours: number[][], indexes: number[]): number[][] => {
    const next = rows.map((row) => [...row]);
    for (const k of indexes) {
      const pos = relative(next);
      const keyed = next[k]!.map((node) => {
        const ns = neighbours[node]!;
        const bary = ns.length > 0 ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(node)!;
        return { node, bary, old: pos.get(node)! };
      });
      keyed.sort((a, b) => a.bary - b.bary || a.old - b.old);
      next[k] = keyed.map((e) => e.node);
    }
    return next;
  };

  let best = layers;
  let bestCrossings = countCrossings(layers, layer, edges);
  const down = Array.from({ length: depth }, (_, i) => i).slice(1);
  const up = Array.from({ length: depth }, (_, i) => depth - 1 - i).slice(1);
  for (let p = 0; p < passes && bestCrossings > 0; p++) {
    layers = sweep(layers, uppers, down);
    layers = sweep(layers, lowers, up);
    const crossings = countCrossings(layers, layer, edges);
    if (crossings < bestCrossings) {
      best = layers;
      bestCrossings = crossings;
    }
  }
  return best;
}

/**
 * Computes the layers, the order in each layer and the node centers. Layer 0 is at the top. Each layer is centered.
 * `maxPerLayer` limits the number of nodes per layer (see `assignLayersBounded`); `priority` is its tie rule.
 */
export function layoutDiagram(
  count: number,
  edges: readonly Edge[],
  start = 0,
  options: LayoutOptions = DEFAULT_LAYOUT,
  maxPerLayer = Infinity,
  priority?: readonly number[],
): Layout {
  const layer = assignLayersBounded(count, edges, start, maxPerLayer, priority);
  const layers = orderLayers(layer, edges, options.passes);
  const widest = layers.reduce((m, row) => Math.max(m, row.length), 0);
  const width = widest * options.nodeWidth + Math.max(0, widest - 1) * options.gapX;
  const height = layers.length * options.nodeHeight + Math.max(0, layers.length - 1) * options.gapY;
  const x = new Array<number>(count).fill(0);
  const y = new Array<number>(count).fill(0);
  layers.forEach((row, k) => {
    const rowWidth = row.length * options.nodeWidth + Math.max(0, row.length - 1) * options.gapX;
    const left = (width - rowWidth) / 2;
    row.forEach((node, i) => {
      x[node] = left + i * (options.nodeWidth + options.gapX) + options.nodeWidth / 2;
      y[node] = k * (options.nodeHeight + options.gapY) + options.nodeHeight / 2;
    });
  });
  return { nodeWidth: options.nodeWidth, maxPerLayer, layer, layers, x, y, width, height };
}

/** The smallest scale of the initial view and of "Fit". Below it the node labels are not readable. */
export const MIN_FIT_SCALE = 0.7;

export interface FitTransform {
  /** Translation of the graph origin in region coordinates. */
  x: number;
  y: number;
  /** Scale. */
  k: number;
}

/**
 * The transform of the initial view and of "Fit". `graph` is the size of the graph, `start` is the top center of the start node in graph
 * coordinates, `region` is the size of the visible region, `pad` is the padding.
 * The scale is the largest scale from MIN_FIT_SCALE to 1 at which the graph width fits; the height does not change the scale, because the
 * user scrolls vertically. The top of the graph is at the top of the region. When the graph width fits, the graph is centered horizontally;
 * else the start node is at the top center of the region.
 * An empty region or an empty graph gives scale 1 and translation (pad, pad).
 */
export function fitTransform(
  graph: { width: number; height: number },
  start: { x: number; y: number },
  region: { width: number; height: number },
  pad: number,
): FitTransform {
  const finite = [graph.width, graph.height, start.x, start.y, region.width, region.height, pad].every(Number.isFinite);
  if (!finite || region.width <= 0 || region.height <= 0 || graph.width <= 0 || graph.height <= 0) return { x: pad, y: pad, k: 1 };
  const k = Math.max(MIN_FIT_SCALE, Math.min(1, (region.width - 2 * pad) / graph.width));
  const x = graph.width * k <= region.width - 2 * pad ? (region.width - graph.width * k) / 2 : region.width / 2 - start.x * k;
  return { x, y: pad - start.y * k, k };
}
