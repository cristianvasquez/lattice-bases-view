// Facet configuration. No runtime import of `obsidian`.
import type { BasesPropertyId } from 'obsidian';

/** One facet: a property of Bases that gives attributes. `key` is the property name without the type prefix. `name` is the display name; without it the key is shown. */
export interface FacetSpec {
  key: string;
  propertyId: BasesPropertyId;
  name?: string;
}

/** File properties that identify one note. They give one value per note and no shared concept, so they are not facets. */
export const NOTE_IDENTITY_PROPERTIES: readonly BasesPropertyId[] = ['file.name', 'file.basename', 'file.path', 'file.file'];

const PREFIXES = ['note.', 'formula.', 'file.'] as const;

function toPropertyId(input: string, allProperties: readonly BasesPropertyId[]): BasesPropertyId {
  if (PREFIXES.some((prefix) => input.startsWith(prefix))) return input as BasesPropertyId;
  const noteId: BasesPropertyId = `note.${input}`;
  const formulaId: BasesPropertyId = `formula.${input}`;
  if (allProperties.includes(formulaId) && !allProperties.includes(noteId)) return formulaId;
  return noteId;
}

/** Adds the facets of `candidates` in order. A facet with no key or with the key of an earlier facet is not added and gives a warning. */
function collectFacets(candidates: { input: string; propertyId: BasesPropertyId; name?: string }[]): { facets: FacetSpec[]; warnings: string[] } {
  const facets: FacetSpec[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, BasesPropertyId>();
  for (const { input, propertyId, name } of candidates) {
    const key = propertyId.slice(propertyId.indexOf('.') + 1);
    if (key === '') {
      warnings.push(`Facet "${input}" has no property name. It is ignored.`);
      continue;
    }
    const first = seen.get(key);
    if (first !== undefined) {
      warnings.push(`Facet "${input}" has the same name "${key}" as facet "${first}". Only "${first}" is used.`);
      continue;
    }
    seen.set(key, propertyId);
    facets.push(name === undefined ? { key, propertyId } : { key, propertyId, name });
  }
  return { facets, warnings };
}

/**
 * Builds the facets from the properties that the user selected for the view (`BasesViewConfig.getOrder()`), in that order.
 * The properties that identify one note (`NOTE_IDENTITY_PROPERTIES`) are not facets.
 * `displayName` gives the name of the facet in the interface (`BasesViewConfig.getDisplayName`).
 */
export function facetsFromProperties(
  propertyIds: readonly BasesPropertyId[],
  displayName?: (propertyId: BasesPropertyId) => string,
): { facets: FacetSpec[]; warnings: string[] } {
  const candidates = propertyIds
    .filter((id) => !NOTE_IDENTITY_PROPERTIES.includes(id))
    .map((propertyId) => {
      const name = displayName?.(propertyId).trim();
      return { input: propertyId, propertyId, ...(name ? { name } : {}) };
    });
  return collectFacets(candidates);
}

/**
 * Converts facet inputs as text into property ids. Used for the option `facets` of views made with an earlier version.
 * An input without a prefix is a note property, or a formula when only the formula exists.
 * A property that is not in `allProperties` is still a valid facet: no note has a value for it yet.
 */
export function resolveFacets(
  inputs: string[],
  allProperties: BasesPropertyId[],
): { facets: FacetSpec[]; warnings: string[] } {
  const candidates = inputs
    .map((raw) => raw.trim())
    .filter((input) => input !== '')
    .map((input) => ({ input, propertyId: toPropertyId(input, allProperties) }));
  return collectFacets(candidates);
}
