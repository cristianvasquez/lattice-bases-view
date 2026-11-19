import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The npm package `obsidian` has only type declarations. Tests get the runtime classes from test/obsidian-mock.ts.
export default defineConfig({
  resolve: {
    alias: { obsidian: fileURLToPath(new URL('./test/obsidian-mock.ts', import.meta.url)) },
  },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
