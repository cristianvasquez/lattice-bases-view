// Options of the view and the conversion of the configured values. Pure: no DOM, no `obsidian` at runtime.
import type { BasesPropertyId } from 'obsidian';
import { type FacetSpec, facetsFromProperties, resolveFacets } from '../bases';

export const VIEW_TYPE = 'concept-lattice';

export const MAX_CONCEPTS = { min: 500, max: 20000, step: 500, default: 5000 } as const;
export const MAX_NODES = { min: 10, max: 150, step: 5, default: 20 } as const;

export interface ViewConfig {
  maxConcepts: number;
  maxNodes: number;
}

function toNumber(raw: unknown, range: { min: number; max: number; default: number }): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return range.default;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

/** Reads the options with `get` (`BasesViewConfig.get`). A missing or invalid value gives the default; a number is clamped to its range. */
export function readViewConfig(get: (key: string) => unknown): ViewConfig {
  return {
    maxConcepts: toNumber(get('maxConcepts'), MAX_CONCEPTS),
    maxNodes: toNumber(get('maxNodes'), MAX_NODES),
  };
}

/** The stored option `facets` of a view made with an earlier version: a list or a comma-separated text. Else an empty list. */
export function readLegacyFacets(raw: unknown): string[] {
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  return [];
}

/** The parts of `BasesViewConfig` and `BasesView` that give the facets. */
export interface FacetSource {
  /** `BasesViewConfig.getOrder()`: the properties that the user selected in the Properties menu. */
  order: readonly BasesPropertyId[];
  displayName: (propertyId: BasesPropertyId) => string;
  /** `BasesViewConfig.get('facets')`: the option of an earlier version. */
  legacy: unknown;
  allProperties: BasesPropertyId[];
}

/**
 * The facets of the view: the selected properties (see `facetsFromProperties`).
 * When no selected property is usable, the stored option `facets` of an earlier version, if there is one.
 */
export function viewFacets(source: FacetSource): { facets: FacetSpec[]; warnings: string[] } {
  const selected = facetsFromProperties(source.order, source.displayName);
  if (selected.facets.length > 0) return selected;
  const legacy = readLegacyFacets(source.legacy);
  if (legacy.length === 0) return selected;
  return resolveFacets(legacy, source.allProperties);
}
