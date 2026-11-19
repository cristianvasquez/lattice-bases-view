import { describe, expect, it } from 'vitest';
import {
  BitSet,
  attributeIds,
  attributeSet,
  closeAttributes,
  closeObjects,
  compareLectic,
  conceptOfAttributes,
  createContext,
  extentOfAttributes,
  intentOfObjects,
  objectIds,
  objectSet,
} from '../src/fca';
import { randomPlainContext, seededRandom, toContext } from './fca-oracle';

describe('BitSet', () => {
  it('has the set operations over word boundaries', () => {
    const a = BitSet.fromIndexes(70, [0, 31, 32, 69]);
    const b = BitSet.fromIndexes(70, [0, 1, 31, 32, 33, 69]);
    expect(a.members()).toEqual([0, 31, 32, 69]);
    expect(a.count()).toBe(4);
    expect(a.isSubsetOf(b)).toBe(true);
    expect(b.isSubsetOf(a)).toBe(false);
    expect(a.and(b).equals(a)).toBe(true);
    expect(a.key()).toBe(a.clone().key());
    expect(a.key()).not.toBe(b.key());
    expect(BitSet.full(70).count()).toBe(70);
    expect(BitSet.full(64).count()).toBe(64);
    expect(BitSet.full(0).members()).toEqual([]);
    expect(BitSet.empty(70).isSubsetOf(a)).toBe(true);
    expect(() => a.and(BitSet.empty(10))).toThrow(RangeError);
    expect(() => a.add(70)).toThrow(RangeError);
  });

  it('compares in lectic order', () => {
    const s = (...i: number[]) => BitSet.fromIndexes(40, i);
    expect(compareLectic(s(), s(0))).toBeLessThan(0);
    expect(compareLectic(s(2), s(1))).toBeLessThan(0);
    expect(compareLectic(s(0, 1), s(2))).toBeGreaterThan(0);
    expect(compareLectic(s(35), s(0, 1, 2, 34))).toBeLessThan(0);
    expect(compareLectic(s(33), s(32, 35))).toBeLessThan(0);
    expect(compareLectic(s(3, 5), s(3, 5))).toBe(0);
  });
});

describe('createContext', () => {
  it('keeps the given order and maps ids to sets', () => {
    const ctx = createContext(['x', 'y'], ['p', 'q', 'r'], [['x', 'p'], ['y', 'r'], ['x', 'r']]);
    expect(ctx.objects).toEqual(['x', 'y']);
    expect(ctx.attributes).toEqual(['p', 'q', 'r']);
    expect(attributeIds(ctx, ctx.objectRows[0]!)).toEqual(['p', 'r']);
    expect(objectIds(ctx, ctx.attributeColumns[2]!)).toEqual(['x', 'y']);
    expect(objectSet(ctx, ['y']).members()).toEqual([1]);
    expect(attributeSet(ctx, ['r', 'p']).members()).toEqual([0, 2]);
    expect(() => objectSet(ctx, ['z'])).toThrow(Error);
  });

  it('throws for a duplicate id and for an unknown id in an incidence pair', () => {
    expect(() => createContext(['x', 'x'], ['p'], [])).toThrow(/Duplicate object/);
    expect(() => createContext(['x'], ['p', 'p'], [])).toThrow(/Duplicate attribute/);
    expect(() => createContext(['x'], ['p'], [['y', 'p']])).toThrow(/unknown object/);
    expect(() => createContext(['x'], ['p'], [['x', 'q']])).toThrow(/unknown attribute/);
  });

  it('accepts zero objects or zero attributes', () => {
    expect(createContext([], ['p'], []).objects).toEqual([]);
    expect(createContext(['x'], [], []).attributes).toEqual([]);
  });
});

describe('derivation and closure', () => {
  it('derives the empty sets to the full sets', () => {
    const ctx = createContext(['x', 'y'], ['p', 'q'], [['x', 'p']]);
    expect(intentOfObjects(ctx, BitSet.empty(2)).members()).toEqual([0, 1]);
    expect(extentOfAttributes(ctx, BitSet.empty(2)).members()).toEqual([0, 1]);
    const c = conceptOfAttributes(ctx, attributeSet(ctx, ['p']));
    expect(objectIds(ctx, c.extent)).toEqual(['x']);
    expect(attributeIds(ctx, c.intent)).toEqual(['p']);
    expect(c.support).toBe(1);
  });

  it('has the closure identities on random contexts', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const ctx = toContext(randomPlainContext(seed, 10, 10));
      const n = ctx.objects.length;
      const m = ctx.attributes.length;
      const rnd = seededRandom(seed * 7919);
      const randomSet = (size: number) => BitSet.fromIndexes(size, Array.from({ length: size }, (_, i) => i).filter(() => rnd() < 0.4));
      for (let k = 0; k < 10; k++) {
        const b = randomSet(m);
        const b2 = randomSet(m).and(b); // b2 ⊆ b
        const bb = closeAttributes(ctx, b);
        expect(b.isSubsetOf(bb)).toBe(true); // extensive
        expect(closeAttributes(ctx, b2).isSubsetOf(bb)).toBe(true); // monotone
        expect(closeAttributes(ctx, bb).equals(bb)).toBe(true); // idempotent
        const a = randomSet(n);
        const a1 = intentOfObjects(ctx, a);
        expect(a.isSubsetOf(closeObjects(ctx, a))).toBe(true);
        expect(closeObjects(ctx, closeObjects(ctx, a)).equals(closeObjects(ctx, a))).toBe(true);
        expect(intentOfObjects(ctx, closeObjects(ctx, a)).equals(a1)).toBe(true); // A''' = A'
        expect(extentOfAttributes(ctx, bb).equals(extentOfAttributes(ctx, b))).toBe(true); // B''' = B'
      }
    }
  });
});
