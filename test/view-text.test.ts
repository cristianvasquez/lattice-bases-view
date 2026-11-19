import { describe, expect, it } from 'vitest';
import { DEFAULT_FACETS } from '../src/bases';
import { readViewConfig } from '../src/view/config';
import { EXPLANATION, fullLatticeText, noValuesText, shorten, shownText } from '../src/view/text';

describe('status text', () => {
  it('separates the full lattice from the displayed part', () => {
    expect(fullLatticeText({ kind: 'running' })).toBe('Full lattice: Computing…');
    expect(fullLatticeText({ kind: 'complete', count: 12 })).toBe('Full lattice: 12 concepts');
    expect(fullLatticeText({ kind: 'budget', count: 5000 })).toBe('Full lattice: more than 5000 concepts (budget reached)');
    expect(shownText(7, false)).toBe('Shown: 7 concepts below the current filter');
    expect(shownText(40, true)).toContain("the 40 concepts with the most notes; select a concept and use 'Filter to this concept' to see below it");
  });

  it('names the configured facets in the no-values text and never says "does not have"', () => {
    expect(noValuesText(['structure', 'data'])).toContain('"structure", "data"');
    for (const text of [EXPLANATION, noValuesText(['x']), noValuesText([])]) expect(text).not.toMatch(/does not have/i);
    expect(EXPLANATION).toContain("not annotated");
  });

  it('shortens long labels with an ellipsis', () => {
    expect(shorten('short', 10)).toBe('short');
    expect(shorten('structure: graph, data: network', 12)).toBe('structure:…');
  });
});

describe('readViewConfig', () => {
  it('gives the defaults for missing values and clamps numbers', () => {
    expect(readViewConfig(() => undefined)).toEqual({ facets: [...DEFAULT_FACETS], maxConcepts: 5000, maxNodes: 40 });
    const values: Record<string, unknown> = { facets: ['task', 'formula.kind'], maxConcepts: 999999, maxNodes: '3' };
    expect(readViewConfig((k) => values[k])).toEqual({ facets: ['task', 'formula.kind'], maxConcepts: 20000, maxNodes: 10 });
  });
});
