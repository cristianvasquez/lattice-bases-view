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

export const NO_FILTER_MATCH_TEXT = 'No note has all of the selected values. Remove a value from the filter.';

/** Shortens a text to `max` characters with an ellipsis at the end. */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
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
  return `${base}: the ${plural(count, 'concept')} with the most notes; select a concept and use 'Filter to this concept' to see below it`;
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
