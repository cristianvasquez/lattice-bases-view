// View state and its transitions. Pure: no DOM, no `obsidian`.
import type { AtlasData } from '../bases';

/** The state that the view keeps across data updates. */
export interface ViewState {
  /** The filter B: selected attribute ids, in the order of the attribute list. Multiple ids mean AND. */
  selected: string[];
  /** The intent (attribute ids) of the focused concept. `null`: no focused concept. `[]` is the concept with the empty intent. */
  focus: string[] | null;
  /** The path of the note in the inspector. */
  selectedNote: string | null;
  /** Search text for the note lists. It does not change the lattice. */
  search: string;
}

export function initialState(): ViewState {
  return { selected: [], focus: null, selectedNote: null, search: '' };
}

/** Keeps the parts of the state whose ids exist in the new data. Drops the focus when one of its ids is gone. */
export function reconcileState(state: ViewState, data: AtlasData): ViewState {
  const attributeIds = new Set(data.attributes.map((a) => a.id));
  const paths = new Set(data.objects.map((o) => o.path));
  const order = new Map(data.attributes.map((a, i) => [a.id, i]));
  const selected = state.selected.filter((id) => attributeIds.has(id)).sort((a, b) => order.get(a)! - order.get(b)!);
  const focus = state.focus !== null && state.focus.every((id) => attributeIds.has(id)) ? state.focus : null;
  const selectedNote = state.selectedNote !== null && paths.has(state.selectedNote) ? state.selectedNote : null;
  return { selected, focus, selectedNote, search: state.search };
}

/** Adds the attribute to the filter, or removes it when it is selected. */
export function toggleValue(state: ViewState, id: string): ViewState {
  const selected = state.selected.includes(id) ? state.selected.filter((s) => s !== id) : [...state.selected, id];
  return { ...state, selected };
}

/** Clears the filter, the search and the focus. The inspector keeps its note. */
export function clearFilters(state: ViewState): ViewState {
  return { ...state, selected: [], search: '', focus: null };
}

/** Sets the filter to the intent of a concept and removes the focus. */
export function filterToConcept(state: ViewState, intent: string[]): ViewState {
  return { ...state, selected: [...intent], focus: null };
}

export function setFocus(state: ViewState, intent: string[] | null): ViewState {
  return { ...state, focus: intent === null ? null : [...intent] };
}

export function selectNote(state: ViewState, path: string | null): ViewState {
  return { ...state, selectedNote: path };
}

export function setSearch(state: ViewState, search: string): ViewState {
  return { ...state, search };
}
