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
  /** The effective facets: the input facets, with the facets derived from nested tags after their tags facet. */
  facets: FacetSpec[];
  objects: AtlasObject[];
  /** Ordered by facet (order of `facets`), then by label. */
  attributes: AtlasAttribute[];
  /** Pairs `[object path, attribute id]`. */
  incidence: [string, string][];
  warnings: string[];
}

/** The parts of one tag. `parent` is the path before the last segment; it is absent for a flat tag. `value` is the last segment. */
export interface TagParts {
  parent?: string;
  value: string;
}

/**
 * Splits the text of one tag. Removes one leading `#`, splits at `/` and ignores empty segments.
 * No segment gives `undefined`. One segment is a flat tag. Two or more segments give the parent path (all segments but the last, joined with `/`) and the value (the last segment).
 */
export function splitTag(text: string): TagParts | undefined {
  const body = text.startsWith('#') ? text.slice(1) : text;
  const segments = body.split('/').filter((segment) => segment !== '');
  const value = segments.pop();
  if (value === undefined) return undefined;
  return segments.length === 0 ? { value } : { parent: segments.join('/'), value };
}

/** A facet derived from a parent tag path. `name` is the last segment of the parent path in its first spelling. `owner` is the key of the tags facet. */
interface DerivedFacet {
  spec: FacetSpec;
  name: string;
  owner: string;
}

/**
 * Builds the atlas data with a given value conversion. `buildAtlasData` in `index.ts` supplies the conversion.
 * For a facet with `tags: true`, a flat tag is an attribute of that facet. A nested tag is an attribute of a derived facet: the key is `#` + the parent path in lower case, the value is the last segment. `AtlasData.facets` is the effective list of facets.
 */
export function buildAtlasDataWith(
  entries: BasesEntry[],
  facets: FacetSpec[],
  convert: (value: Value | null) => ConvertedValue,
): AtlasData {
  const objects: AtlasObject[] = [];
  const attributes = new Map<string, AtlasAttribute>();
  const incidence: [string, string][] = [];
  const errorCounts = new Map<string, number>();
  const derived = new Map<string, DerivedFacet>();
  const flatTagFacets = new Set<string>();

  const add = (object: AtlasObject, facetKey: string, label: string): void => {
    const ids = (object.attributes[facetKey] ??= []);
    const id = `${facetKey}:${label.toLowerCase()}`;
    if (ids.includes(id)) return;
    ids.push(id);
    incidence.push([object.path, id]);
    if (!attributes.has(id)) attributes.set(id, { id, facet: facetKey, label });
  };

  for (const entry of entries) {
    const object: AtlasObject = { path: entry.file.path, name: entry.file.basename, attributes: {}, unannotated: [], errors: [] };
    for (const facet of facets) {
      object.attributes[facet.key] = [];
      const converted = convert(entry.getValue(facet.propertyId));
      if (converted.kind !== 'values') {
        object.unannotated.push(facet.key);
        if (converted.kind === 'error') {
          object.errors.push(facet.key);
          errorCounts.set(facet.key, (errorCounts.get(facet.key) ?? 0) + 1);
        }
        continue;
      }
      if (facet.tags !== true) {
        for (const label of converted.values) add(object, facet.key, label);
        continue;
      }
      for (const text of converted.values) {
        const parts = splitTag(text);
        if (parts === undefined) continue;
        if (parts.parent === undefined) {
          add(object, facet.key, parts.value);
          flatTagFacets.add(facet.key);
          continue;
        }
        const key = `#${parts.parent.toLowerCase()}`;
        if (!derived.has(key)) {
          const name = parts.parent.slice(parts.parent.lastIndexOf('/') + 1);
          derived.set(key, { spec: { key, propertyId: facet.propertyId, tags: true }, name, owner: facet.key });
        }
        add(object, key, parts.value);
      }
      // A note with only nested tags has no value for the tags facet itself.
      if (object.attributes[facet.key]?.length === 0) object.unannotated.push(facet.key);
    }
    objects.push(object);
  }

  // Effective facets: each input facet in order; after a tags facet, its derived facets sorted by key.
  const sortedDerived = [...derived.values()].sort((a, b) => (a.spec.key < b.spec.key ? -1 : a.spec.key > b.spec.key ? 1 : 0));
  const omitted = new Set<string>();
  const effective: FacetSpec[] = [];
  for (const facet of facets) {
    const own = facet.tags === true ? sortedDerived.filter((d) => d.owner === facet.key) : [];
    if (own.length > 0 && !flatTagFacets.has(facet.key) && !errorCounts.has(facet.key)) omitted.add(facet.key);
    else effective.push(facet);
    effective.push(...own.map((d) => d.spec));
  }

  // The name of a derived facet is its key when another facet of the result has the same display name (case ignored).
  const displayName = (facet: FacetSpec): string => (facet.name ?? derived.get(facet.key)?.name ?? facet.key).toLowerCase();
  const nameCounts = new Map<string, number>();
  for (const facet of effective) nameCounts.set(displayName(facet), (nameCounts.get(displayName(facet)) ?? 0) + 1);
  for (const d of sortedDerived) d.spec.name = (nameCounts.get(d.name.toLowerCase()) ?? 0) > 1 ? d.spec.key : d.name;

  // Second pass: each object gets each derived facet. No value means "not annotated", never negative evidence.
  for (const object of objects) {
    for (const key of omitted) {
      delete object.attributes[key];
      object.unannotated = object.unannotated.filter((k) => k !== key);
    }
    for (const d of sortedDerived) {
      if (object.attributes[d.spec.key] !== undefined) continue;
      object.attributes[d.spec.key] = [];
      object.unannotated.push(d.spec.key);
    }
  }

  const facetOrder = new Map(effective.map((facet, index) => [facet.key, index]));
  const sorted = [...attributes.values()].sort((a, b) => {
    const byFacet = (facetOrder.get(a.facet) ?? 0) - (facetOrder.get(b.facet) ?? 0);
    if (byFacet !== 0) return byFacet;
    const ka = a.label.toLowerCase();
    const kb = b.label.toLowerCase();
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const warnings: string[] = [];
  for (const facet of effective) {
    const count = errorCounts.get(facet.key);
    if (count === undefined) continue;
    const notes = count === 1 ? '1 note' : `${count} notes`;
    warnings.push(`Facet "${facet.key}": the value of ${notes} is an error. These notes are shown as not annotated for this facet.`);
  }

  return { facets: effective, objects, attributes: sorted, incidence, warnings };
}
