// The worker script that main.js embeds: built with the plugin of esbuild.config.mjs, then run with a fake worker scope.
import { describe, expect, it } from 'vitest';
import { bundleWorker } from '../scripts/worker-bundle.mjs';
import { computeLattice } from '../src/fca';
import { buildRequest, unpackResult } from '../src/worker/protocol';
import { conceptKey, randomPlainContext, toContext } from './fca-oracle';

describe('the bundled worker script', () => {
  it('is self-contained, posts ready, and answers a build request with the result of computeLattice', async () => {
    const { code, inputs } = await bundleWorker({ minify: true });
    expect(code).not.toMatch(/\brequire\(/);
    expect(code).not.toContain('obsidian');
    expect(inputs.some((p) => p.endsWith('src/fca/lattice.ts'))).toBe(true);

    const posted: unknown[] = [];
    const scope: { onmessage: ((event: { data: unknown }) => void) | null; postMessage(message: unknown): void } = {
      onmessage: null,
      postMessage: (message) => posted.push(message),
    };
    new Function('self', code)(scope);
    expect(posted).toEqual([{ type: 'ready' }]);

    const ctx = toContext(randomPlainContext(4, 30, 12, true));
    const { message, transfer } = buildRequest(7, ctx, 1000, true);
    scope.onmessage!({ data: structuredClone(message, { transfer }) });
    const reply = posted[1] as { type: string; id: number; result: Parameters<typeof unpackResult>[0] };
    expect(reply.type).toBe('result');
    expect(reply.id).toBe(7);
    const got = unpackResult(reply.result);
    const expected = computeLattice(ctx, { maxConcepts: 1000 });
    expect(got.concepts.map(conceptKey)).toEqual(expected.concepts.map(conceptKey));
    expect(got.covers).toEqual(expected.covers);
  });
});
