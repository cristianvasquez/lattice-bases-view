// Facet configuration. No runtime import of `obsidian`.
import type { BasesPropertyId } from 'obsidian';

/** The facets that the view uses when the user configures none. */
export const DEFAULT_FACETS: readonly string[] = ['structure', 'data', 'task', 'interaction'];

/** One facet: a property of Bases that gives attributes. `key` is the property name without the type prefix. */
export interface FacetSpec {
  key: string;
  propertyId: BasesPropertyId;
}

const PREFIXES = ['note.', 'formula.', 'file.'] as const;

function toPropertyId(input: string, allProperties: readonly BasesPropertyId[]): BasesPropertyId {
  if (PREFIXES.some((prefix) => input.startsWith(prefix))) return input as BasesPropertyId;
  const noteId: BasesPropertyId = `note.${input}`;
  const formulaId: BasesPropertyId = `formula.${input}`;
  if (allProperties.includes(formulaId) && !allProperties.includes(noteId)) return formulaId;
  return noteId;
}

/**
 * Converts the facet inputs of the user into property ids.
 * An input without a prefix is a note property, or a formula when only the formula exists.
 * A property that is not in `allProperties` is still a valid facet: no note has a value for it yet.
 */
export function resolveFacets(
  inputs: string[],
  allProperties: BasesPropertyId[],
): { facets: FacetSpec[]; warnings: string[] } {
  const facets: FacetSpec[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, BasesPropertyId>();
  for (const raw of inputs) {
    const input = raw.trim();
    if (input === '') continue;
    const propertyId = toPropertyId(input, allProperties);
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
    facets.push({ key, propertyId });
  }
  return { facets, warnings };
}
