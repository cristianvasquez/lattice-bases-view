#!/usr/bin/env node
// Copy the built plugin into a vault: <vault>/.obsidian/plugins/lattice-bases-view/.
// Usage: node scripts/install-to-vault.mjs [vault path]   (default: ./test-vault)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vault = resolve(process.argv[2] ?? join(root, 'test-vault'));
const files = ['main.js', 'manifest.json', 'styles.css'];

if (!existsSync(vault)) {
  console.error(`Vault not found: ${vault}`);
  process.exit(1);
}
for (const file of files) {
  if (!existsSync(join(root, file))) {
    console.error(`Missing ${file}. Run "pnpm build" first.`);
    process.exit(1);
  }
}
const target = join(vault, '.obsidian', 'plugins', 'lattice-bases-view');
mkdirSync(target, { recursive: true });
for (const file of files) copyFileSync(join(root, file), join(target, file));
console.log(`Installed ${files.join(', ')} in ${target}`);
