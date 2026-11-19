// View state and its transitions. Pure: no DOM, no `obsidian`.
import type { AtlasData } from '../bases';

/** The state that the view keeps across data updates. */
export interface ViewState {
  /** The filter B: selected attribute ids, in the order of the attribute list. Multiple ids mean AND. */
  selected: string[];
  /** The intent (attribute ids) of the focused concept. `null`: no focused concept. `[]` is the concept with the empty intent. */
  focus: string[] | null;
  /** Search text for the note lists. It does not change the lattice. */
  search: string;
  /** The stack of previous filters. `filterToConcept` pushes the filter before it; `backFilter` pops. The last item is the top of the stack. */
  previous: string[][];
}

export function initialState(): ViewState {
  return { selected: [], focus: null, search: '', previous: [] };
}

/** Keeps the parts of the state whose ids exist in the new data. Drops the focus when one of its ids is gone. */
export function reconcileState(state: ViewState, data: AtlasData): ViewState {
  const attributeIds = new Set(data.attributes.map((a) => a.id));
  const order = new Map(data.attributes.map((a, i) => [a.id, i]));
  const keep = (ids: readonly string[]) => ids.filter((id) => attributeIds.has(id)).sort((a, b) => order.get(a)! - order.get(b)!);
  const selected = keep(state.selected);
  const focus = state.focus !== null && state.focus.every((id) => attributeIds.has(id)) ? state.focus : null;
  return { selected, focus, search: state.search, previous: state.previous.map(keep) };
}

/** Adds the attribute to the filter, or removes it when it is selected. Empties the stack of previous filters. */
export function toggleValue(state: ViewState, id: string): ViewState {
  const selected = state.selected.includes(id) ? state.selected.filter((s) => s !== id) : [...state.selected, id];
  return { ...state, selected, previous: [] };
}

/** Clears the filter, the search, the focus and the stack of previous filters. */
export function clearFilters(state: ViewState): ViewState {
  return { ...state, selected: [], search: '', focus: null, previous: [] };
}

/** Sets the filter to the intent of a concept and removes the focus. Pushes the filter before it to the stack of previous filters. */
export function filterToConcept(state: ViewState, intent: string[]): ViewState {
  return { ...state, selected: [...intent], focus: null, previous: [...state.previous, [...state.selected]] };
}

/** Sets the filter back to the top of the stack of previous filters and removes the focus. With an empty stack, returns `state` with no change. */
export function backFilter(state: ViewState): ViewState {
  const top = state.previous[state.previous.length - 1];
  if (top === undefined) return state;
  return { ...state, selected: [...top], focus: null, previous: state.previous.slice(0, -1) };
}

export function setFocus(state: ViewState, intent: string[] | null): ViewState {
  return { ...state, focus: intent === null ? null : [...intent] };
}

export function setSearch(state: ViewState, search: string): ViewState {
  return { ...state, search };
}
