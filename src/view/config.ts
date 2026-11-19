// Options of the view and the conversion of the configured values. Pure: no DOM, no `obsidian` at runtime.
import { DEFAULT_FACETS } from '../bases';

export const VIEW_TYPE = 'concept-lattice';

export const MAX_CONCEPTS = { min: 500, max: 20000, step: 500, default: 5000 } as const;
export const MAX_NODES = { min: 10, max: 150, step: 5, default: 40 } as const;

export interface ViewConfig {
  facets: string[];
  maxConcepts: number;
  maxNodes: number;
}

function toNumber(raw: unknown, range: { min: number; max: number; default: number }): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return range.default;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

function toFacets(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [...DEFAULT_FACETS];
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  return [...DEFAULT_FACETS];
}

/** Reads the options with `get` (`BasesViewConfig.get`). A missing or invalid value gives the default; a number is clamped to its range. */
export function readViewConfig(get: (key: string) => unknown): ViewConfig {
  return {
    facets: toFacets(get('facets')),
    maxConcepts: toNumber(get('maxConcepts'), MAX_CONCEPTS),
    maxNodes: toNumber(get('maxNodes'), MAX_NODES),
  };
}
