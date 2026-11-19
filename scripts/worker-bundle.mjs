// The lattice worker in main.js. `bundleWorker` bundles src/worker/entry.ts to one self-contained script (IIFE).
// `latticeWorkerPlugin` gives that script as the text of the module `virtual:lattice-worker`, so that main.js contains it as a string
// and starts it from a Blob URL. In watch mode, esbuild builds again when a source file of the worker changes.
import esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WORKER_ENTRY = resolve(root, 'src/worker/entry.ts');

/** Returns the worker script and the absolute paths of its source files. */
export async function bundleWorker({ minify = false } = {}) {
  const result = await esbuild.build({
    entryPoints: [WORKER_ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify,
    treeShaking: true,
    metafile: true,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const inputs = Object.keys(result.metafile.inputs).map((p) => resolve(root, p));
  return { code, inputs };
}

export function latticeWorkerPlugin({ minify = false } = {}) {
  return {
    name: 'lattice-worker',
    setup(build) {
      build.onResolve({ filter: /^virtual:lattice-worker$/ }, (args) => ({ path: args.path, namespace: 'lattice-worker' }));
      build.onLoad({ filter: /.*/, namespace: 'lattice-worker' }, async () => {
        const { code, inputs } = await bundleWorker({ minify });
        return { contents: code, loader: 'text', watchFiles: inputs };
      });
    },
  };
}
