// Message protocol between the UI thread and the lattice worker, and the serialisation of the formal context and of the result.
// Pure TypeScript: no import of `obsidian`, no DOM. Each message is structured-clone friendly. The bit sets cross the boundary as one
// Uint32Array per message (transferable), not as BitSet objects.
import { BitSet, type Concept, type Cover, type FormalContext, type LatticeResult, type LatticeStatus, computeLattice } from '../fca';

/** A formal context as plain data. `rows` holds the attribute set of each object: object g uses words [g * w, (g + 1) * w), w = ceil(|M| / 32). */
export interface PackedContext {
  readonly objects: string[];
  readonly attributes: string[];
  readonly rows: Uint32Array;
}

/** A lattice result as plain data. Concept i uses words [i * s, (i + 1) * s) of `sets`, s = extent words + intent words: the extent, then the intent. */
export interface PackedLatticeResult {
  readonly status: LatticeStatus;
  readonly objectCount: number;
  readonly attributeCount: number;
  readonly conceptCount: number;
  readonly sets: Uint32Array;
  /** Cover pairs, flat: [upper0, lower0, upper1, lower1, ...]. */
  readonly covers: Uint32Array;
}

/** UI thread to worker. */
export interface BuildRequest {
  readonly type: 'build';
  readonly id: number;
  readonly context: PackedContext;
  readonly maxConcepts: number;
  readonly covers: boolean;
}

/** Worker to UI thread. 'ready' is the first message of the worker: it shows that the worker script started. */
export type WorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'result'; readonly id: number; readonly result: PackedLatticeResult }
  | { readonly type: 'error'; readonly id: number; readonly message: string };

/** A message and the buffers to transfer with it. */
export interface Outgoing<T> {
  readonly message: T;
  readonly transfer: ArrayBuffer[];
}

const wordsFor = (size: number): number => (size + 31) >>> 5;

/** Copies the object rows of the context into one new buffer. The context does not change. */
export function packContext(ctx: FormalContext): PackedContext {
  const w = wordsFor(ctx.attributes.length);
  const rows = new Uint32Array(ctx.objects.length * w);
  ctx.objectRows.forEach((row, g) => rows.set(row.words, g * w));
  return { objects: [...ctx.objects], attributes: [...ctx.attributes], rows };
}

/** The formal context of packed data. The object rows are views on `packed.rows`; the attribute columns are computed. */
export function unpackContext(packed: PackedContext): FormalContext {
  const n = packed.objects.length;
  const m = packed.attributes.length;
  const w = wordsFor(m);
  if (packed.rows.length !== n * w) throw new RangeError(`Packed context of ${n} objects and ${m} attributes needs ${n * w} words, got ${packed.rows.length}`);
  const index = (ids: readonly string[], kind: string): Map<string, number> => {
    const map = new Map<string, number>();
    ids.forEach((id, i) => {
      if (map.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
      map.set(id, i);
    });
    return map;
  };
  const objectRows = Array.from({ length: n }, (_, g) => new BitSet(m, packed.rows.subarray(g * w, (g + 1) * w)));
  const attributeColumns = Array.from({ length: m }, () => BitSet.empty(n));
  objectRows.forEach((row, g) => {
    for (const j of row.members()) attributeColumns[j]!.add(g);
  });
  return {
    objects: [...packed.objects],
    attributes: [...packed.attributes],
    objectIndex: index(packed.objects, 'object'),
    attributeIndex: index(packed.attributes, 'attribute'),
    objectRows,
    attributeColumns,
  };
}

export function packResult(result: LatticeResult, objectCount: number, attributeCount: number): PackedLatticeResult {
  const ew = wordsFor(objectCount);
  const s = ew + wordsFor(attributeCount);
  const sets = new Uint32Array(result.concepts.length * s);
  result.concepts.forEach((c, i) => {
    sets.set(c.extent.words, i * s);
    sets.set(c.intent.words, i * s + ew);
  });
  const covers = new Uint32Array(result.covers.length * 2);
  result.covers.forEach(([u, l], i) => {
    covers[2 * i] = u;
    covers[2 * i + 1] = l;
  });
  return { status: result.status, objectCount, attributeCount, conceptCount: result.concepts.length, sets, covers };
}

/** The lattice result of packed data. The bit sets are views on `packed.sets`, with no copy. */
export function unpackResult(packed: PackedLatticeResult): LatticeResult {
  const { objectCount, attributeCount, conceptCount } = packed;
  const ew = wordsFor(objectCount);
  const s = ew + wordsFor(attributeCount);
  if (packed.sets.length !== conceptCount * s) throw new RangeError(`Packed result of ${conceptCount} concepts needs ${conceptCount * s} words, got ${packed.sets.length}`);
  if (packed.covers.length % 2 !== 0) throw new RangeError(`Packed covers need an even number of entries, got ${packed.covers.length}`);
  const concepts: Concept[] = [];
  for (let i = 0; i < conceptCount; i++) {
    const extent = new BitSet(objectCount, packed.sets.subarray(i * s, i * s + ew));
    const intent = new BitSet(attributeCount, packed.sets.subarray(i * s + ew, (i + 1) * s));
    concepts.push({ extent, intent, support: extent.count() });
  }
  const covers: Cover[] = [];
  for (let i = 0; i < packed.covers.length; i += 2) {
    const u = packed.covers[i]!;
    const l = packed.covers[i + 1]!;
    if (u >= conceptCount || l >= conceptCount) throw new RangeError(`Cover pair [${u}, ${l}] is out of range 0..${conceptCount - 1}`);
    covers.push([u, l]);
  }
  return { concepts, covers, status: packed.status };
}

export function buildRequest(id: number, ctx: FormalContext, maxConcepts: number, covers: boolean): Outgoing<BuildRequest> {
  const context = packContext(ctx);
  return { message: { type: 'build', id, context, maxConcepts, covers }, transfer: [context.rows.buffer as ArrayBuffer] };
}

/** The work of the worker for one message. Never throws: an error becomes an 'error' response. Used by the worker entry and by the tests. */
export function handleRequest(data: unknown): Outgoing<WorkerResponse> | null {
  if (!isBuildRequest(data)) return null;
  try {
    const ctx = unpackContext(data.context);
    const result = computeLattice(ctx, { maxConcepts: data.maxConcepts, covers: data.covers });
    const packed = packResult(result, ctx.objects.length, ctx.attributes.length);
    return { message: { type: 'result', id: data.id, result: packed }, transfer: [packed.sets.buffer as ArrayBuffer, packed.covers.buffer as ArrayBuffer] };
  } catch (err) {
    return { message: { type: 'error', id: data.id, message: err instanceof Error ? err.message : String(err) }, transfer: [] };
  }
}

function isBuildRequest(data: unknown): data is BuildRequest {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Partial<BuildRequest>;
  return d.type === 'build' && typeof d.id === 'number' && typeof d.maxConcepts === 'number' && typeof d.covers === 'boolean' && typeof d.context === 'object' && d.context !== null && d.context.rows instanceof Uint32Array;
}

export function isWorkerResponse(data: unknown): data is WorkerResponse {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as { type?: unknown; id?: unknown };
  if (d.type === 'ready') return true;
  return (d.type === 'result' || d.type === 'error') && typeof d.id === 'number';
}
