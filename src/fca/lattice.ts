import type { FormalContext } from './context';
import { type Concept, lowerNeighbours, nextClosureConcepts } from './derivation';

/** A cover pair [upperIndex, lowerIndex] of indexes in a concept list: the upper concept covers the lower concept. */
export type Cover = readonly [upper: number, lower: number];

export type LatticeStatus = 'complete' | 'budget' | 'cancelled';

export interface BuildLatticeOptions {
  /** The largest number of concepts to compute. A lattice with more concepts gives status 'budget'. */
  maxConcepts: number;
  /** The time in milliseconds after which the computation gives control back to the event loop. Default 12. */
  sliceMs?: number;
  /** When the signal aborts, the promise resolves with status 'cancelled'. */
  signal?: AbortSignal;
  /** When false, the cover relations are not computed and `covers` is empty. Default true. */
  covers?: boolean;
}

export interface LatticeResult {
  /**
   * 'complete': all concepts of the full lattice, in lectic order of the intents.
   * 'budget': the lattice has more than maxConcepts concepts; the first maxConcepts in lectic order.
   * 'cancelled': the concepts computed before the signal aborted.
   */
  concepts: Concept[];
  /** The Hasse diagram as cover pairs of indexes in `concepts`. Empty unless status is 'complete' and the option `covers` is not false. */
  covers: Cover[];
  status: LatticeStatus;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Computes the full concept lattice of the context with a budget. Gives control back to the event loop after each slice of `sliceMs`
 * milliseconds, in the enumeration and in the cover computation. Resolves, never rejects, on cancellation.
 */
export async function buildLattice(ctx: FormalContext, options: BuildLatticeOptions): Promise<LatticeResult> {
  const { maxConcepts, sliceMs = 12, signal, covers: withCovers = true } = options;
  if (Number.isNaN(maxConcepts) || maxConcepts < 0) throw new RangeError(`maxConcepts must be a number ≥ 0: ${maxConcepts}`);
  const concepts: Concept[] = [];
  let sliceStart = Date.now();
  const sliceOver = async (): Promise<boolean> => {
    if (Date.now() - sliceStart < sliceMs) return false;
    await yieldToEventLoop();
    sliceStart = Date.now();
    return signal?.aborted ?? false;
  };

  if (signal?.aborted) return { concepts, covers: [], status: 'cancelled' };
  for (const concept of nextClosureConcepts(ctx)) {
    if (signal?.aborted) return { concepts, covers: [], status: 'cancelled' };
    if (concepts.length >= maxConcepts) return { concepts, covers: [], status: 'budget' };
    concepts.push(concept);
    if (await sliceOver()) return { concepts, covers: [], status: 'cancelled' };
  }
  if (!withCovers) return { concepts, covers: [], status: 'complete' };

  const indexByExtent = new Map<string, number>();
  concepts.forEach((c, i) => indexByExtent.set(c.extent.key(), i));
  const covers: Cover[] = [];
  for (let upper = 0; upper < concepts.length; upper++) {
    if (signal?.aborted) return { concepts, covers: [], status: 'cancelled' };
    const lowers = lowerNeighbours(ctx, concepts[upper]!).map((c) => indexByExtent.get(c.extent.key())!);
    lowers.sort((a, b) => a - b);
    for (const lower of lowers) covers.push([upper, lower]);
    if (await sliceOver()) return { concepts, covers: [], status: 'cancelled' };
  }
  return { concepts, covers, status: 'complete' };
}
