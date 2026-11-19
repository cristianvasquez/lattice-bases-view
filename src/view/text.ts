// Interface text. Pure: no DOM. A missing value is "not annotated"; the text never says that a note does not have a property.

export const EXPLANATION =
  "The lattice shows recorded property values only. A missing value means 'not annotated', not 'false'. Values that all matching notes share are a fact about these records, not a rule about the domain.";

/** The line below the diagram toolbar. It gives the reading rule of the reduced labels, the double-click and the button "Back". */
export const HIGHLIGHT_HINT = 'Point at a concept to see its values above it. Double-click to filter to it; use Back to return.';

export const ZERO_SUPPORT_TEXT = 'No note has all of these values';

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function notesText(n: number): string {
  return plural(n, 'note');
}

/** The short number of notes in a diagram node: "(3)". The accessible name of the node keeps "3 notes". */
export function countText(n: number): string {
  return `(${n})`;
}

/** The count line of the notes column. `shown` is the number of notes after the search, or null when no search text is set. */
export function notesCountText(total: number, filterActive: boolean, shown: number | null): string {
  const base = filterActive ? `${notesText(total)} ${total === 1 ? 'matches' : 'match'} the filter` : notesText(total);
  return shown === null ? base : `${base}, ${shown} shown`;
}

/** The line of the notes column for a focused concept. */
export function focusCountText(count: number): string {
  return `${count} of these ${count === 1 ? 'is' : 'are'} in the focused concept`;
}

/** Text of the link that sets the filter to the focused concept. */
export function filterToText(count: number): string {
  return `Filter to ${count === 1 ? 'this 1' : `these ${count}`}`;
}

export const NO_FILTER_MATCH_TEXT = 'No note has all of the selected values. Remove a value from the filter.';

/** Shortens a text to `max` characters with an ellipsis at the end. */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Display labels for the values of one facet. When all values are paths with the same leading folders
 * (for example the values of `file.folder`), the common folders are removed: `a/b/c` and `a/b/d` give `c` and `d`.
 * A value that is equal to the common part gives its last folder with `/` at the end. Other label sets are returned as given.
 */
export function shortPathLabels(labels: readonly string[]): string[] {
  if (labels.length < 2 || !labels.some((l) => l.includes('/'))) return [...labels];
  const parts = labels.map((l) => l.split('/'));
  let common = 0;
  const first = parts[0]!;
  while (common < first.length && parts.every((p) => p.length > common && p[common] === first[common])) common++;
  if (common === 0) return [...labels];
  const short = parts.map((p) => (p.length === common ? `${p[common - 1]}/` : p.slice(common).join('/')));
  return new Set(short).size === short.length ? short : [...labels];
}

/** Display label of each attribute id: the label of the attribute, with common leading folders removed per facet. */
export function displayLabels(attributes: readonly { id: string; facet: string; label: string }[]): Map<string, string> {
  const byFacet = new Map<string, { id: string; label: string }[]>();
  for (const a of attributes) {
    const list = byFacet.get(a.facet) ?? [];
    list.push(a);
    byFacet.set(a.facet, list);
  }
  const result = new Map<string, string>();
  for (const list of byFacet.values()) {
    const short = shortPathLabels(list.map((a) => a.label));
    list.forEach((a, i) => result.set(a.id, short[i]!));
  }
  return result;
}

export function valueText(facet: string, label: string): string {
  return `${facet}: ${label}`;
}

/** The state of the computation of the full lattice. */
export type FullLatticeState =
  | { kind: 'running' }
  | { kind: 'complete'; count: number }
  | { kind: 'budget'; count: number }
  | { kind: 'error'; message: string };

export function fullLatticeText(state: FullLatticeState): string {
  switch (state.kind) {
    case 'running':
      return 'Full lattice: Computing…';
    case 'complete':
      return `Full lattice: ${plural(state.count, 'concept')}`;
    case 'budget':
      return `Full lattice: more than ${plural(state.count, 'concept')} (budget reached)`;
    case 'error':
      return `Full lattice: not computed (${state.message})`;
  }
}

export function shownText(count: number, truncated: boolean): string {
  const base = `Shown: ${plural(count, 'concept')} below the current filter`;
  if (!truncated) return base;
  return `${base}: the ${plural(count, 'concept')} with the most notes; double-click a concept to see below it`;
}

export function noEntriesText(): string {
  return 'Bases gives no notes to this view. Change the filters of the base so that it includes notes.';
}

export function noValuesText(facets: readonly string[]): string {
  if (facets.length === 0) return 'No facet property is configured. Add facet properties in the view options ("Facet properties").';
  const names = facets.map((f) => `"${f}"`).join(', ');
  return `No note in this base has a value for the configured facets ${names}. Add values to these properties in the notes, or change "Facet properties" in the view options.`;
}

export function noSearchMatchText(search: string): string {
  return `No matching note has a name that contains "${search}". Change the search text.`;
}

export function errorText(message: string): string {
  return `Concept Atlas could not show the lattice: ${message}. Check "Facet properties" in the view options, then reopen the base.`;
}
