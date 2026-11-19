import type { FormalContext } from './context';
import { type Concept, compareBySupport, lowerNeighbours } from './derivation';
import type { Cover } from './lattice';

export interface ExploreResult {
  /** Concepts below `start` (start first), in the order of the search: supports do not increase. */
  concepts: Concept[];
  /** All cover pairs [upperIndex, lowerIndex] between concepts of the result. */
  covers: Cover[];
  /** True when concepts below `start` are not in the result. */
  truncated: boolean;
}

/**
 * Bounded overview of the sub-lattice below `start`. Best-first search through `lowerNeighbours`: the concept with the largest support
 * goes first; ties go in lectic order of the intents. Stops at `maxConcepts` concepts. The result is closed upward inside the sub-lattice
 * below `start`: for each concept in the result, all concepts between it and `start` are in the result.
 */
export function exploreBySupport(ctx: FormalContext, start: Concept, maxConcepts: number): ExploreResult {
  if (!Number.isInteger(maxConcepts) || maxConcepts < 1) throw new RangeError(`maxConcepts must be an integer ≥ 1: ${maxConcepts}`);
  const concepts: Concept[] = [];
  const lowerKeys: string[][] = [];
  const indexByKey = new Map<string, number>();
  const frontier = new Map<string, Concept>([[start.extent.key(), start]]);

  // A concept has a larger support than each concept below it, so a concept leaves the frontier only after all concepts between it and start.
  while (concepts.length < maxConcepts && frontier.size > 0) {
    let best: Concept | undefined;
    let bestKey = '';
    for (const [key, c] of frontier) {
      if (!best || compareBySupport(c, best) < 0) {
        best = c;
        bestKey = key;
      }
    }
    frontier.delete(bestKey);
    indexByKey.set(bestKey, concepts.length);
    concepts.push(best!);
    const lowers = lowerNeighbours(ctx, best!);
    const keys: string[] = [];
    for (const lower of lowers) {
      const key = lower.extent.key();
      keys.push(key);
      if (!indexByKey.has(key) && !frontier.has(key)) frontier.set(key, lower);
    }
    lowerKeys.push(keys);
  }

  const covers: Cover[] = [];
  lowerKeys.forEach((keys, upper) => {
    const lowers = keys.map((k) => indexByKey.get(k)).filter((i): i is number => i !== undefined);
    lowers.sort((a, b) => a - b);
    for (const lower of lowers) covers.push([upper, lower]);
  });
  return { concepts, covers, truncated: frontier.size > 0 };
}
