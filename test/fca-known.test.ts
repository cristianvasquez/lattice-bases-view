import { describe, expect, it } from 'vitest';
import { type FormalContext, attributeIds, buildLattice, createContext, nextClosureConcepts, objectIds } from '../src/fca';
import { type PlainContext, coverKeys, oracleConcepts, oracleCovers, toContext } from './fca-oracle';

const full = async (ctx: FormalContext) => {
  const result = await buildLattice(ctx, { maxConcepts: 10_000 });
  expect(result.status).toBe('complete');
  return result;
};

const named = (ctx: FormalContext, r: Awaited<ReturnType<typeof full>>) =>
  r.concepts.map((c) => ({ extent: objectIds(ctx, c.extent), intent: attributeIds(ctx, c.intent), support: c.support }));

describe('known context 1: 3 objects, 3 attributes, object i has attribute j when i ≠ j', () => {
  const pairs: [string, string][] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) pairs.push([`o${i}`, `a${j}`]);
  const ctx = createContext(['o0', 'o1', 'o2'], ['a0', 'a1', 'a2'], pairs);

  it('has 8 concepts and 12 cover edges with the exact extents and intents', async () => {
    const r = await full(ctx);
    expect(r.concepts).toHaveLength(8);
    expect(r.covers).toHaveLength(12);
    // Lectic order of the intents. The extent is the complement of the intent.
    expect(named(ctx, r)).toEqual([
      { extent: ['o0', 'o1', 'o2'], intent: [], support: 3 },
      { extent: ['o0', 'o1'], intent: ['a2'], support: 2 },
      { extent: ['o0', 'o2'], intent: ['a1'], support: 2 },
      { extent: ['o0'], intent: ['a1', 'a2'], support: 1 },
      { extent: ['o1', 'o2'], intent: ['a0'], support: 2 },
      { extent: ['o1'], intent: ['a0', 'a2'], support: 1 },
      { extent: ['o2'], intent: ['a0', 'a1'], support: 1 },
      { extent: [], intent: ['a0', 'a1', 'a2'], support: 0 },
    ]);
    // Each cover removes exactly one object from the extent.
    for (const [u, l] of r.covers) {
      expect(r.concepts[l]!.extent.isSubsetOf(r.concepts[u]!.extent)).toBe(true);
      expect(r.concepts[u]!.support - r.concepts[l]!.support).toBe(1);
    }
  });

  it('has a bottom concept with support 0 one time (no object has all attributes)', async () => {
    const r = await full(ctx);
    const bottoms = r.concepts.filter((c) => c.intent.count() === 3);
    expect(bottoms).toHaveLength(1);
    expect(bottoms[0]!.support).toBe(0);
    expect(r.concepts[r.concepts.length - 1]).toBe(bottoms[0]);
  });
});

describe('known context 2: living beings and water (Ganter and Wille)', () => {
  // a needs water to live, b lives in water, c lives on land, d needs chlorophyll, e two seed leaves, f one seed leaf, g can move, h has limbs, i suckles its offspring.
  const rows: Record<string, string> = {
    leech: 'abg',
    bream: 'abgh',
    frog: 'abcgh',
    dog: 'acghi',
    'spike-weed': 'abdf',
    reed: 'abcdf',
    bean: 'acde',
    maize: 'acdf',
  };
  const attributes = 'abcdefghi'.split('');
  const plain: PlainContext = {
    objects: Object.keys(rows),
    attributes,
    rel: Object.values(rows).map((r) => attributes.map((a) => r.includes(a))),
  };
  const ctx = toContext(plain);

  it('has 19 concepts and the covers of the oracle', async () => {
    const oracle = oracleConcepts(plain);
    expect(oracle).toHaveLength(19);
    const r = await full(ctx);
    expect(r.concepts).toHaveLength(19);
    expect(coverKeys(r.concepts, r.covers)).toEqual(oracleCovers(oracle));
    expect(attributeIds(ctx, r.concepts[0]!.intent)).toEqual(['a']);
    expect(r.concepts[0]!.support).toBe(8);
    expect(attributeIds(ctx, r.concepts[r.concepts.length - 1]!.intent)).toEqual(attributes);
    expect(r.concepts[r.concepts.length - 1]!.support).toBe(0);
  });
});

describe('special contexts', () => {
  it('a chain context of n concepts has n − 1 cover edges', async () => {
    const k = 6; // object i has the attributes j < i
    const ids = (p: string) => Array.from({ length: k }, (_, i) => `${p}${i}`);
    const pairs: [string, string][] = [];
    for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) pairs.push([`o${i}`, `a${j}`]);
    const r = await full(createContext(ids('o'), ids('a'), pairs));
    expect(r.concepts).toHaveLength(k + 1);
    expect(r.covers).toHaveLength(k);
    expect(r.concepts.map((c) => c.support)).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(r.covers).toEqual(Array.from({ length: k }, (_, i) => [i, i + 1]));
  });

  it('zero objects: 1 concept, extent empty, intent all attributes, support 0, no cover', async () => {
    const ctx = createContext([], ['p', 'q'], []);
    const r = await full(ctx);
    expect(r.concepts).toHaveLength(1);
    expect(r.concepts[0]!.extent.count()).toBe(0);
    expect(attributeIds(ctx, r.concepts[0]!.intent)).toEqual(['p', 'q']);
    expect(r.concepts[0]!.support).toBe(0);
    expect(r.covers).toEqual([]);
  });

  it('zero attributes: 1 concept, extent all objects', async () => {
    const ctx = createContext(['x', 'y'], [], []);
    const r = await full(ctx);
    expect(r.concepts).toHaveLength(1);
    expect(objectIds(ctx, r.concepts[0]!.extent)).toEqual(['x', 'y']);
    expect(r.concepts[0]!.intent.count()).toBe(0);
    expect(r.covers).toEqual([]);
  });

  it('zero objects and zero attributes: 1 concept', () => {
    expect([...nextClosureConcepts(createContext([], [], []))]).toHaveLength(1);
  });

  it('no object has all attributes: the bottom has support 0 and is in the result one time', async () => {
    const ctx = createContext(['x', 'y', 'z'], ['p', 'q'], [['x', 'p'], ['y', 'q']]);
    const r = await full(ctx);
    const bottoms = r.concepts.filter((c) => c.intent.count() === 2);
    expect(bottoms).toHaveLength(1);
    expect(bottoms[0]!.support).toBe(0);
    expect(r.concepts).toHaveLength(4);
  });
});
