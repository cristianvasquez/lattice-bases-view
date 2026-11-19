// Public API of the Bases adapter.
import type { BasesEntry } from 'obsidian';
import { buildAtlasDataWith, type AtlasData } from './atlas';
import type { FacetSpec } from './facets';
import { convertValue } from './values';

export type { AtlasAttribute, AtlasData, AtlasObject, ConvertedValue } from './atlas';
export { DEFAULT_FACETS, resolveFacets, type FacetSpec } from './facets';
export { convertValue } from './values';

/** Converts the entries that Bases supplies into objects, attributes and incidence. Object identity is the file path. */
export function buildAtlasData(entries: BasesEntry[], facets: FacetSpec[]): AtlasData {
  return buildAtlasDataWith(entries, facets, convertValue);
}
