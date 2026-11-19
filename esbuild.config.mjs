// Build src/main.ts into main.js (CommonJS, the format that Obsidian loads).
// The lattice worker (src/worker/entry.ts) is bundled separately and embedded in main.js as a string (scripts/worker-bundle.mjs).
// `node esbuild.config.mjs` watches; `node esbuild.config.mjs production` builds one time, minified.
import esbuild from 'esbuild';
import { latticeWorkerPlugin } from './scripts/worker-bundle.mjs';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  minify: production,
  treeShaking: true,
  outfile: 'main.js',
  plugins: [latticeWorkerPlugin({ minify: production })],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
