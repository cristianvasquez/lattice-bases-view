import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

describe('manifest', () => {
  it('has the plugin id and the version of package.json', () => {
    const manifest = read('manifest.json');
    expect(manifest.id).toBe('lattice-bases-view');
    expect(manifest.version).toBe(read('package.json').version);
    expect(read('versions.json')[manifest.version]).toBe(manifest.minAppVersion);
  });
});
