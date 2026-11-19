// Test helpers for the FCA tests: a seeded pseudo-random context generator and a brute-force oracle that does not use src/fca.
import { type Concept, type FormalContext, createContext } from '../src/fca';

/** mulberry32: a small seeded pseudo-random generator. Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PlainContext {
  objects: string[];
  attributes: string[];
  /** rel[g][m] is true when object g has attribute m. */
  rel: boolean[][];
}

export function randomPlainContext(seed: number, maxObjects: number, maxAttributes: number, fixed = false): PlainContext {
  const rnd = seededRandom(seed);
  const n = fixed ? maxObjects : Math.floor(rnd() * (maxObjects + 1));
  const m = fixed ? maxAttributes : Math.floor(rnd() * (maxAttributes + 1));
  const density = 0.2 + 0.6 * rnd();
  const objects = Array.from({ length: n }, (_, g) => `o${g}`);
  const attributes = Array.from({ length: m }, (_, j) => `a${j}`);
  const rel = objects.map(() => attributes.map(() => rnd() < density));
  return { objects, attributes, rel };
}

export function toContext(p: PlainContext): FormalContext {
  const pairs: [string, string][] = [];
  p.rel.forEach((row, g) => row.forEach((has, j) => has && pairs.push([p.objects[g]!, p.attributes[j]!])));
  return createContext(p.objects, p.attributes, pairs);
}

export interface OracleConcept {
  extent: number[];
  intent: number[];
}

export const keyOf = (c: OracleConcept): string => `${c.extent.join(',')}|${c.intent.join(',')}`;
export const conceptKey = (c: Concept): string => keyOf({ extent: c.extent.members(), intent: c.intent.members() });

/** Closure of each attribute subset (2^m subsets). */
export function oracleConcepts(p: PlainContext): OracleConcept[] {
  const n = p.objects.length;
  const m = p.attributes.length;
  const seen = new Map<string, OracleConcept>();
  for (let mask = 0; mask < 1 << m; mask++) {
    const extent: number[] = [];
    for (let g = 0; g < n; g++) {
      let all = true;
      for (let j = 0; j < m; j++) if (mask & (1 << j) && !p.rel[g]![j]) all = false;
      if (all) extent.push(g);
    }
    const intent: number[] = [];
    for (let j = 0; j < m; j++) if (extent.every((g) => p.rel[g]![j])) intent.push(j);
    const c = { extent, intent };
    seen.set(keyOf(c), c);
  }
  return [...seen.values()];
}

const strictSubset = (a: number[], b: number[]): boolean => a.length < b.length && a.every((x) => b.includes(x));

/** Cover edges from the definition, as pairs of concept keys [upper, lower]. */
export function oracleCovers(concepts: OracleConcept[]): string[] {
  const out: string[] = [];
  for (const upper of concepts)
    for (const lower of concepts) {
      if (!strictSubset(lower.extent, upper.extent)) continue;
      const between = concepts.some((c) => strictSubset(lower.extent, c.extent) && strictSubset(c.extent, upper.extent));
      if (!between) out.push(`${keyOf(upper)} > ${keyOf(lower)}`);
    }
  return out.sort();
}

/** Cover pairs of a result as sorted strings of concept keys, for comparison with oracleCovers. */
export function coverKeys(concepts: Concept[], covers: readonly (readonly [number, number])[]): string[] {
  return covers.map(([u, l]) => `${conceptKey(concepts[u]!)} > ${conceptKey(concepts[l]!)}`).sort();
}
