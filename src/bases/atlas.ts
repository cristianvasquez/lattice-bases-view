// Objects, attributes and incidence from Bases entries. No runtime import of `obsidian`.
import type { BasesEntry, Value } from 'obsidian';
import type { FacetSpec } from './facets';

/** The result of the conversion of one evaluated value. "unannotated" means that no value is recorded; it is not negative evidence. */
export type ConvertedValue =
  | { kind: 'values'; values: string[] }
  | { kind: 'unannotated' }
  | { kind: 'error'; message: string };

/** One note. `path` is the object identity. */
export interface AtlasObject {
  path: string;
  name: string;
  /** Per facet key: the attribute ids of the note, in the order of the values. A facet without values has an empty list. */
  attributes: Record<string, string[]>;
  /** Facet keys with no recorded value. Includes the facets in `errors`. */
  unannotated: string[];
  /** Facet keys whose value is an error. */
  errors: string[];
}

/** One attribute. `id` is `<facet key>:<value key>`; the value key is the value in lower case. `label` is the first spelling that occurs. */
export interface AtlasAttribute {
  id: string;
  facet: string;
  label: string;
}

export interface AtlasData {
  facets: FacetSpec[];
  objects: AtlasObject[];
  /** Ordered by facet (order of `facets`), then by label. */
  attributes: AtlasAttribute[];
  /** Pairs `[object path, attribute id]`. */
  incidence: [string, string][];
  warnings: string[];
}

/** Builds the atlas data with a given value conversion. `buildAtlasData` in `index.ts` supplies the conversion. */
export function buildAtlasDataWith(
  entries: BasesEntry[],
  facets: FacetSpec[],
  convert: (value: Value | null) => ConvertedValue,
): AtlasData {
  const objects: AtlasObject[] = [];
  const attributes = new Map<string, AtlasAttribute>();
  const incidence: [string, string][] = [];
  const errorCounts = new Map<string, number>();

  for (const entry of entries) {
    const path = entry.file.path;
    const object: AtlasObject = { path, name: entry.file.basename, attributes: {}, unannotated: [], errors: [] };
    for (const facet of facets) {
      const ids: string[] = [];
      object.attributes[facet.key] = ids;
      const converted = convert(entry.getValue(facet.propertyId));
      if (converted.kind !== 'values') {
        object.unannotated.push(facet.key);
        if (converted.kind === 'error') {
          object.errors.push(facet.key);
          errorCounts.set(facet.key, (errorCounts.get(facet.key) ?? 0) + 1);
        }
        continue;
      }
      for (const label of converted.values) {
        const id = `${facet.key}:${label.toLowerCase()}`;
        if (ids.includes(id)) continue;
        ids.push(id);
        incidence.push([path, id]);
        if (!attributes.has(id)) attributes.set(id, { id, facet: facet.key, label });
      }
    }
    objects.push(object);
  }

  const facetOrder = new Map(facets.map((facet, index) => [facet.key, index]));
  const sorted = [...attributes.values()].sort((a, b) => {
    const byFacet = (facetOrder.get(a.facet) ?? 0) - (facetOrder.get(b.facet) ?? 0);
    if (byFacet !== 0) return byFacet;
    const ka = a.label.toLowerCase();
    const kb = b.label.toLowerCase();
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const warnings: string[] = [];
  for (const facet of facets) {
    const count = errorCounts.get(facet.key);
    if (count === undefined) continue;
    const notes = count === 1 ? '1 note' : `${count} notes`;
    warnings.push(`Facet "${facet.key}": the value of ${notes} is an error. These notes are shown as not annotated for this facet.`);
  }

  return { facets, objects, attributes: sorted, incidence, warnings };
}
