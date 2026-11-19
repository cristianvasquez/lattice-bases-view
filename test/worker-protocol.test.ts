import { describe, expect, it } from 'vitest';
import { computeLattice } from '../src/fca';
import {
  type BuildRequest,
  type WorkerResponse,
  buildRequest,
  handleRequest,
  isWorkerResponse,
  packContext,
  packResult,
  unpackContext,
  unpackResult,
} from '../src/worker/protocol';
import { conceptKey, randomPlainContext, toContext } from './fca-oracle';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('serialisation of the formal context', () => {
  it('gives the same context after pack, structured clone and unpack', () => {
    // 40 × 8 and 70 × 40: sizes that are not multiples of 32 and need more than one word.
    for (const [seed, n, m] of [...SEEDS.map((s) => [s, 8, 8] as const), [101, 70, 40] as const, [102, 33, 65] as const]) {
      const ctx = toContext(randomPlainContext(seed, n, m, seed > 100));
      const packed = structuredClone(packContext(ctx));
      const back = unpackContext(packed);
      expect(back.objects).toEqual(ctx.objects);
      expect(back.attributes).toEqual(ctx.attributes);
      expect([...back.objectIndex]).toEqual([...ctx.objectIndex]);
      expect([...back.attributeIndex]).toEqual([...ctx.attributeIndex]);
      expect(back.objectRows.map((r) => r.key())).toEqual(ctx.objectRows.map((r) => r.key()));
      expect(back.attributeColumns.map((c) => c.key())).toEqual(ctx.attributeColumns.map((c) => c.key()));
    }
  });

  it('packs the rows into one new buffer and does not change the context', () => {
    const ctx = toContext(randomPlainContext(7, 40, 40, true));
    const before = ctx.objectRows.map((r) => r.key());
    const { message, transfer } = buildRequest(1, ctx, 100, false);
    expect(transfer).toEqual([message.context.rows.buffer]);
    structuredClone(message, { transfer });
    // The transferred buffer is detached; the rows of the context are separate buffers.
    expect(message.context.rows.length).toBe(0);
    expect(ctx.objectRows.map((r) => r.key())).toEqual(before);
  });

  it('throws for rows of the wrong length and for duplicate ids', () => {
    expect(() => unpackContext({ objects: ['a'], attributes: ['x'], rows: new Uint32Array(2) })).toThrow(RangeError);
    expect(() => unpackContext({ objects: ['a', 'a'], attributes: ['x'], rows: new Uint32Array(2) })).toThrow('Duplicate object id');
  });
});

describe('serialisation of the result', () => {
  it('gives the same concepts and covers after pack, structured clone and unpack', () => {
    for (const seed of SEEDS) {
      const ctx = toContext(randomPlainContext(seed, 8, 8));
      for (const result of [computeLattice(ctx, { maxConcepts: 1000 }), computeLattice(ctx, { maxConcepts: 3 })]) {
        const packed = packResult(result, ctx.objects.length, ctx.attributes.length);
        const back = unpackResult(structuredClone(packed, { transfer: [packed.sets.buffer, packed.covers.buffer] }));
        expect(back.status).toBe(result.status);
        expect(back.concepts.map(conceptKey)).toEqual(result.concepts.map(conceptKey));
        expect(back.concepts.map((c) => c.support)).toEqual(result.concepts.map((c) => c.support));
        expect(back.covers).toEqual(result.covers);
      }
    }
  });

  it('throws for inconsistent packed data', () => {
    const base = { status: 'complete' as const, objectCount: 2, attributeCount: 2, conceptCount: 1, sets: new Uint32Array(2), covers: new Uint32Array(0) };
    expect(() => unpackResult({ ...base, sets: new Uint32Array(3) })).toThrow(RangeError);
    expect(() => unpackResult({ ...base, covers: new Uint32Array(1) })).toThrow(RangeError);
    expect(() => unpackResult({ ...base, covers: Uint32Array.of(0, 1) })).toThrow(RangeError);
  });
});

describe('handleRequest (the work of the worker)', () => {
  it('gives the result of computeLattice for a build request', () => {
    for (const seed of SEEDS) {
      const ctx = toContext(randomPlainContext(seed, 8, 8));
      for (const covers of [true, false]) {
        const request = buildRequest(seed, ctx, 1000, covers);
        const data = structuredClone(request.message, { transfer: request.transfer });
        const out = handleRequest(data)!;
        const message = structuredClone(out.message, { transfer: out.transfer });
        expect(message.type).toBe('result');
        if (message.type !== 'result') continue;
        expect(message.id).toBe(seed);
        const expected = computeLattice(ctx, { maxConcepts: 1000, covers });
        const got = unpackResult(message.result);
        expect(got.status).toBe(expected.status);
        expect(got.concepts.map(conceptKey)).toEqual(expected.concepts.map(conceptKey));
        expect(got.covers).toEqual(expected.covers);
      }
    }
  });

  it('gives an error response for a budget that is not valid', () => {
    const ctx = toContext(randomPlainContext(3, 4, 4, true));
    const out = handleRequest(buildRequest(9, ctx, -1, false).message);
    expect(out?.message).toMatchObject({ type: 'error', id: 9 });
    expect(out?.transfer).toEqual([]);
  });

  it('ignores a message that is not a build request', () => {
    expect(handleRequest(null)).toBeNull();
    expect(handleRequest({ type: 'build', id: 1 })).toBeNull();
    expect(handleRequest({ type: 'other' })).toBeNull();
    const bad: Omit<BuildRequest, 'context'> & { context: unknown } = { type: 'build', id: 1, maxConcepts: 1, covers: false, context: { rows: [1] } };
    expect(handleRequest(bad)).toBeNull();
  });

  it('isWorkerResponse accepts the three response types only', () => {
    const ok: WorkerResponse[] = [{ type: 'ready' }, { type: 'error', id: 1, message: 'x' }];
    for (const r of ok) expect(isWorkerResponse(r)).toBe(true);
    expect(isWorkerResponse({ type: 'result' })).toBe(false);
    expect(isWorkerResponse('ready')).toBe(false);
    expect(isWorkerResponse(null)).toBe(false);
  });
});
