import { describe, expect, it } from 'vitest';
import { type LatticeResult, buildLattice, computeLattice } from '../src/fca';
import { LatticeComputer } from '../src/worker/client';
import { packResult } from '../src/worker/protocol';
import { conceptKey, coverKeys, keyOf, oracleConcepts, oracleCovers, randomPlainContext, toContext } from './fca-oracle';
import { FakeSource } from './worker-helpers';

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function same(a: LatticeResult, b: LatticeResult): void {
  expect(a.status).toBe(b.status);
  expect(a.concepts.map(conceptKey)).toEqual(b.concepts.map(conceptKey));
  expect(a.covers).toEqual(b.covers);
}

describe('LatticeComputer: worker path and UI-thread path give the same result', () => {
  it('on random contexts, with and without covers, and equal to the oracle', async () => {
    const source = new FakeSource();
    const inWorker = new LatticeComputer(source);
    const onMain = new LatticeComputer(null, { sliceMs: 1 });
    for (const seed of SEEDS) {
      const plain = randomPlainContext(seed, 8, 8);
      const ctx = toContext(plain);
      for (const covers of [true, false]) {
        const w = await inWorker.compute(ctx, { maxConcepts: 1000, covers });
        const m = await onMain.compute(ctx, { maxConcepts: 1000, covers });
        expect(w.mode).toBe('worker');
        expect(m.mode).toBe('main-thread');
        same(w.result, m.result);
        same(w.result, await buildLattice(ctx, { maxConcepts: 1000, covers }));
        expect([...w.result.concepts.map(conceptKey)].sort()).toEqual(oracleConcepts(plain).map(keyOf).sort());
        if (covers) expect(coverKeys(w.result.concepts, w.result.covers)).toEqual(oracleCovers(oracleConcepts(plain)));
      }
    }
    // One worker for all computations that were not cancelled.
    expect(source.workers).toHaveLength(1);
    inWorker.dispose();
    onMain.dispose();
  });

  it("keeps the budget: status 'budget' and the first maxConcepts concepts", async () => {
    const ctx = toContext(randomPlainContext(3, 8, 8, true));
    const computer = new LatticeComputer(new FakeSource());
    const run = await computer.compute(ctx, { maxConcepts: 5, covers: false });
    expect(run.mode).toBe('worker');
    same(run.result, computeLattice(ctx, { maxConcepts: 5, covers: false }));
    expect(run.result.status).toBe('budget');
    expect(run.result.concepts).toHaveLength(5);
    computer.dispose();
  });
});

describe('LatticeComputer: fallback to the UI thread', () => {
  const ctx = toContext(randomPlainContext(5, 8, 8, true));
  const expected = computeLattice(ctx, { maxConcepts: 1000 });

  it('without a worker source', async () => {
    const computer = new LatticeComputer(null);
    expect(computer.usesFallback).toBe(true);
    const run = await computer.compute(ctx, { maxConcepts: 1000 });
    expect(run.mode).toBe('main-thread');
    same(run.result, expected);
  });

  it('when the worker cannot be created', async () => {
    const source = new FakeSource({ throwOnCreate: true });
    const computer = new LatticeComputer(source);
    const run = await computer.compute(ctx, { maxConcepts: 1000 });
    expect(run.mode).toBe('main-thread');
    same(run.result, expected);
    expect(computer.usesFallback).toBe(true);
    computer.dispose();
    expect(source.disposed).toBe(true);
  });

  it('when the worker script does not start (error before ready), for this and the later computations', async () => {
    const source = new FakeSource({ failStart: true });
    const computer = new LatticeComputer(source);
    const run = await computer.compute(ctx, { maxConcepts: 1000 });
    expect(run.mode).toBe('main-thread');
    same(run.result, expected);
    expect(source.workers).toHaveLength(1);
    expect(source.workers[0]!.terminated).toBe(true);
    expect(source.workers[0]!.listenerCount).toBe(0);
    const again = await computer.compute(ctx, { maxConcepts: 1000 });
    expect(again.mode).toBe('main-thread');
    expect(source.workers).toHaveLength(1);
    computer.dispose();
  });
});

describe('LatticeComputer: cancellation', () => {
  const big = toContext(randomPlainContext(11, 60, 16, true));

  it('an aborted signal terminates the worker and gives status cancelled; the next computation starts a new worker', async () => {
    const source = new FakeSource({ delayMs: 20 });
    const computer = new LatticeComputer(source);
    const controller = new AbortController();
    const pending = computer.compute(big, { maxConcepts: 100_000 }, controller.signal);
    await tick();
    controller.abort();
    const run = await pending;
    expect(run.result.status).toBe('cancelled');
    expect(run.result.concepts).toEqual([]);
    expect(source.workers[0]!.terminated).toBe(true);
    expect(source.workers[0]!.listenerCount).toBe(0);
    const next = await computer.compute(big, { maxConcepts: 100_000, covers: false });
    expect(next.mode).toBe('worker');
    expect(next.result.status).toBe('complete');
    expect(source.workers).toHaveLength(2);
    computer.dispose();
  });

  it('a new computation cancels the computation that runs; the old result is never given', async () => {
    const source = new FakeSource({ delayMs: 10 });
    const computer = new LatticeComputer(source);
    const small = toContext(randomPlainContext(2, 6, 6, true));
    const first = computer.compute(big, { maxConcepts: 100_000 });
    const second = computer.compute(small, { maxConcepts: 1000 });
    expect((await first).result.status).toBe('cancelled');
    same((await second).result, computeLattice(small, { maxConcepts: 1000 }));
    expect(source.workers[0]!.terminated).toBe(true);
    computer.dispose();
  });

  it('ignores a result message with the id of another computation', async () => {
    const source = new FakeSource({ delayMs: 30 });
    const computer = new LatticeComputer(source);
    const small = toContext(randomPlainContext(2, 6, 6, true));
    let settled: LatticeResult | null = null;
    const pending = computer.compute(small, { maxConcepts: 1000 }).then((r) => (settled = r.result));
    await tick();
    const wrong = packResult(computeLattice(big, { maxConcepts: 3 }), big.objects.length, big.attributes.length);
    source.workers[0]!.reply({ type: 'result', id: 999, result: wrong });
    await tick();
    expect(settled).toBeNull();
    await pending;
    same(settled!, computeLattice(small, { maxConcepts: 1000 }));
    computer.dispose();
  });

  it('dispose cancels, terminates the worker, removes the listeners and releases the source', async () => {
    const source = new FakeSource({ delayMs: 20 });
    const computer = new LatticeComputer(source);
    const pending = computer.compute(big, { maxConcepts: 100_000 });
    await tick();
    computer.dispose();
    expect((await pending).result.status).toBe('cancelled');
    expect(source.workers[0]!.terminated).toBe(true);
    expect(source.workers[0]!.listenerCount).toBe(0);
    expect(source.disposed).toBe(true);
    expect((await computer.compute(big, { maxConcepts: 10 })).result.status).toBe('cancelled');
    expect(source.workers).toHaveLength(1);
  });

  it('cancels the time-sliced computation of the fallback', async () => {
    const computer = new LatticeComputer(null, { sliceMs: 1 });
    const controller = new AbortController();
    const pending = computer.compute(big, { maxConcepts: 100_000 }, controller.signal);
    setTimeout(() => controller.abort(), 0);
    const run = await pending;
    expect(run.mode).toBe('main-thread');
    expect(run.result.status).toBe('cancelled');
  });
});

describe('LatticeComputer: errors', () => {
  it('rejects with the message of an error response, as the UI-thread path rejects', async () => {
    const ctx = toContext(randomPlainContext(3, 4, 4, true));
    const computer = new LatticeComputer(new FakeSource());
    await expect(computer.compute(ctx, { maxConcepts: -1 })).rejects.toThrow('maxConcepts must be a number ≥ 0');
    await expect(new LatticeComputer(null).compute(ctx, { maxConcepts: -1 })).rejects.toThrow('maxConcepts must be a number ≥ 0');
    computer.dispose();
  });

  it('rejects when the worker fails after it started, and does not fall back', async () => {
    const source = new FakeSource({ delayMs: 50 });
    const computer = new LatticeComputer(source);
    const ctx = toContext(randomPlainContext(3, 8, 8, true));
    const pending = computer.compute(ctx, { maxConcepts: 1000 });
    await tick(5);
    const event = Object.assign(new Event('error', { cancelable: true }), { message: 'out of memory' });
    source.workers[0]!.emit('error', event);
    await expect(pending).rejects.toThrow('The lattice worker failed: out of memory');
    expect(event.defaultPrevented).toBe(true);
    expect(source.workers[0]!.terminated).toBe(true);
    expect(computer.usesFallback).toBe(false);
    computer.dispose();
  });
});
