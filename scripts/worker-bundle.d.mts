// Types of scripts/worker-bundle.mjs, for the tests.
import type { Plugin } from 'esbuild';

export const WORKER_ENTRY: string;
export function bundleWorker(options?: { minify?: boolean }): Promise<{ code: string; inputs: string[] }>;
export function latticeWorkerPlugin(options?: { minify?: boolean }): Plugin;
