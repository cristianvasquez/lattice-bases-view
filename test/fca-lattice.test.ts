import { describe, expect, it } from 'vitest';
import {
  compareLectic,
  buildLattice,
  conceptOfAttributes,
  BitSet,
  exploreBySupport,
  lowerNeighbours,
  nextClosureConcepts,
  upperNeighbours,
} from '../src/fca';
import { conceptKey, coverKeys, keyOf, oracleConcepts, oracleCovers, randomPlainContext, toContext } from './fca-oracle';

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('Next Closure and buildLattice against the brute-force oracle', () => {
  it('gives the concepts of the oracle, each one time, in lectic order of the intents (60 random contexts up to 8 × 8)', () => {
    for (const seed of SEEDS) {
      const plain = randomPlainContext(seed, 8, 8);
      const ctx = toContext(plain);
      const concepts = [...nextClosureConcepts(ctx)];
      const keys = concepts.map(conceptKey);
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort()).toEqual(oracleConcepts(plain).map(keyOf).sort());
      for (let i = 1; i < concepts.length; i++) expect(compareLectic(concepts[i - 1]!.intent, concepts[i]!.intent)).toBeLessThan(0);
      expect(concepts[0]!.extent.count()).toBe(ctx.objects.length);
      expect(concepts[concepts.length - 1]!.intent.count()).toBe(ctx.attributes.length);
      for (const c of concepts) expect(c.support).toBe(c.extent.count());
    }
  });

  it('gives the cover edges of the oracle', async () => {
    for (const seed of SEEDS) {
      const plain = randomPlainContext(seed, 8, 8);
      const r = await buildLattice(toContext(plain), { maxConcepts: 1000 });
      expect(r.status).toBe('complete');
      expect(coverKeys(r.concepts, r.covers)).toEqual(oracleCovers(oracleConcepts(plain)));
    }
  });
});

describe('local navigation', () => {
  it('lowerNeighbours and upperNeighbours agree with the covers of buildLattice', async () => {
    for (const seed of SEEDS) {
      const ctx = toContext(randomPlainContext(seed, 8, 8));
      const r = await buildLattice(ctx, { maxConcepts: 1000 });
      const byKey = new Map(r.concepts.map((c, i) => [conceptKey(c), i]));
      const index = (c: Parameters<typeof conceptKey>[0]) => byKey.get(conceptKey(c));
      r.concepts.forEach((c, i) => {
        const lower = lowerNeighbours(ctx, c).map(index).sort();
        const upper = upperNeighbours(ctx, c).map(index).sort();
        expect(lower).toEqual(r.covers.filter(([u]) => u === i).map(([, l]) => l).sort());
        expect(upper).toEqual(r.covers.filter(([, l]) => l === i).map(([u]) => u).sort());
      });
    }
  });
});

describe('exploreBySupport', () => {
  it('with a large limit gives the concepts and covers of buildLattice below start', async () => {
    for (const seed of SEEDS) {
      const ctx = toContext(randomPlainContext(seed, 8, 8));
      const r = await buildLattice(ctx, { maxConcepts: 1000 });
      // Start at the top and at a concept in the middle of the lattice order.
      for (const start of [r.concepts[0]!, r.concepts[Math.floor(r.concepts.length / 2)]!]) {
        const below = r.concepts.map((c, i) => [c, i] as const).filter(([c]) => c.extent.isSubsetOf(start.extent));
        const inside = new Set(below.map(([, i]) => i));
        const expectedCovers = coverKeys(
          r.concepts,
          r.covers.filter(([u, l]) => inside.has(u) && inside.has(l)),
        );
        const e = exploreBySupport(ctx, start, 1000);
        expect(e.truncated).toBe(false);
        expect(e.concepts.map(conceptKey).sort()).toEqual(below.map(([c]) => conceptKey(c)).sort());
        expect(coverKeys(e.concepts, e.covers)).toEqual(expectedCovers);
        expect(conceptKey(e.concepts[0]!)).toBe(conceptKey(start));
      }
    }
  });

  it('with a small limit is closed upward, has supports that do not increase, and is truncated', async () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const ctx = toContext(randomPlainContext(seed, 8, 8, true));
      const r = await buildLattice(ctx, { maxConcepts: 1000 });
      if (r.concepts.length < 8) continue;
      const limit = Math.floor(r.concepts.length / 2);
      const start = r.concepts[0]!;
      const e = exploreBySupport(ctx, start, limit);
      checked++;
      expect(e.concepts).toHaveLength(limit);
      expect(e.truncated).toBe(true);
      for (let i = 1; i < e.concepts.length; i++) expect(e.concepts[i]!.support).toBeLessThanOrEqual(e.concepts[i - 1]!.support);
      const inResult = new Set(e.concepts.map(conceptKey));
      for (const c of e.concepts)
        for (const d of r.concepts) {
          const between = c.extent.isSubsetOf(d.extent) && d.extent.isSubsetOf(start.extent);
          if (between) expect(inResult.has(conceptKey(d))).toBe(true);
        }
      // The covers are all cover pairs of the full lattice between concepts of the result.
      const expected = coverKeys(r.concepts, r.covers).filter((k) => {
        const [u, l] = k.split(' > ');
        return inResult.has(u!) && inResult.has(l!);
      });
      expect(coverKeys(e.concepts, e.covers)).toEqual(expected);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('is deterministic', () => {
    const ctx = toContext(randomPlainContext(5, 8, 8, true));
    const start = conceptOfAttributes(ctx, BitSet.empty(8));
    const a = exploreBySupport(ctx, start, 5);
    const b = exploreBySupport(ctx, start, 5);
    expect(a.concepts.map(conceptKey)).toEqual(b.concepts.map(conceptKey));
    expect(a.covers).toEqual(b.covers);
  });
});

describe('buildLattice budget, cancellation and time slices', () => {
  it("gives 'budget' with the first maxConcepts concepts in lectic order and no covers", async () => {
    const ctx = toContext(randomPlainContext(3, 8, 8, true));
    const all = [...nextClosureConcepts(ctx)];
    expect(all.length).toBeGreaterThan(5);
    const r = await buildLattice(ctx, { maxConcepts: 5 });
    expect(r.status).toBe('budget');
    expect(r.concepts.map(conceptKey)).toEqual(all.slice(0, 5).map(conceptKey));
    expect(r.covers).toEqual([]);
    const exact = await buildLattice(ctx, { maxConcepts: all.length });
    expect(exact.status).toBe('complete');
  });

  it('with covers: false gives the same concepts and status and no covers', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ctx = toContext(randomPlainContext(seed, 7, 6, true));
      const full = await buildLattice(ctx, { maxConcepts: 1000 });
      const bare = await buildLattice(ctx, { maxConcepts: 1000, covers: false });
      expect(bare.status).toBe('complete');
      expect(bare.concepts.map(conceptKey)).toEqual(full.concepts.map(conceptKey));
      expect(bare.covers).toEqual([]);
      expect(full.concepts.length <= 1 || full.covers.length > 0).toBe(true);
    }
  });

  it("resolves with 'cancelled' for an aborted signal", async () => {
    const ctx = toContext(randomPlainContext(3, 8, 8, true));
    const controller = new AbortController();
    controller.abort();
    const r = await buildLattice(ctx, { maxConcepts: 1000, signal: controller.signal });
    expect(r.status).toBe('cancelled');
    expect(r.covers).toEqual([]);
  });

  it("resolves with 'cancelled' when the signal aborts during the computation", async () => {
    const ctx = toContext(randomPlainContext(11, 60, 16, true));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);
    const r = await buildLattice(ctx, { maxConcepts: 100_000, sliceMs: 1, signal: controller.signal });
    expect(r.status).toBe('cancelled');
  });

  it('gives control back to the event loop on a context of 60 objects and 16 attributes', async () => {
    const ctx = toContext(randomPlainContext(11, 60, 16, true));
    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 0);
    let firedBeforeResolve = false;
    const r = await buildLattice(ctx, { maxConcepts: 100_000 }).then((result) => {
      firedBeforeResolve = fired;
      return result;
    });
    expect(r.status).toBe('complete');
    expect(firedBeforeResolve).toBe(true);
    expect(r.concepts.length).toBeGreaterThan(100);
  });
});
