// Visibility of the three panels (filters, lattice, notes) and the rules that follow from it. Pure: no DOM, no `obsidian`.
import { type ColumnFrame, LATTICE_MIN_REM, SIDE_MIN_REM, type Side } from './columns';

export type Panel = 'filters' | 'lattice' | 'notes';
export type PanelVisibility = Record<Panel, boolean>;

/** The panels from left to right. */
export const PANELS: readonly Panel[] = ['filters', 'lattice', 'notes'];
/** The key of the stored visibility flags (`App.saveLocalStorage`, per vault). */
export const PANELS_KEY = 'lattice-bases-view-panels';

export function allVisible(): PanelVisibility {
  return { filters: true, lattice: true, notes: true };
}

function visibleCount(v: PanelVisibility): number {
  return PANELS.filter((p) => v[p]).length;
}

/** Hides or shows one panel. The last visible panel stays visible. */
export function togglePanel(v: PanelVisibility, panel: Panel): PanelVisibility {
  if (v[panel] && visibleCount(v) <= 1) return v;
  return { ...v, [panel]: !v[panel] };
}

/** Reads the stored flags. Data that is not valid (not three booleans, or no visible panel) gives all panels visible. */
export function readStoredPanels(raw: unknown): PanelVisibility {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return allVisible();
    }
  }
  if (typeof value !== 'object' || value === null) return allVisible();
  const record = value as Record<string, unknown>;
  if (!PANELS.every((p) => typeof record[p] === 'boolean')) return allVisible();
  const v: PanelVisibility = { filters: record.filters as boolean, lattice: record.lattice as boolean, notes: record.notes as boolean };
  return visibleCount(v) > 0 ? v : allVisible();
}

export interface PanelLayout {
  visible: PanelVisibility;
  /** The panel that takes the remaining width: the lattice; else the notes column; else the filters column. */
  flexible: Panel;
  /** The handle at the right of the filters column and the handle at the left of the notes column. A handle shows only between two visible panels when its column has a set width. */
  handles: Record<Side, boolean>;
  /** The toggle of the last visible panel is disabled. */
  disabled: Record<Panel, boolean>;
  /** The side columns with a set width, and the minimum of the flexible column. */
  frame: ColumnFrame;
}

export function panelLayout(visible: PanelVisibility): PanelLayout {
  const flexible: Panel = visible.lattice ? 'lattice' : visible.notes ? 'notes' : 'filters';
  const sized = {
    filters: visible.filters && flexible !== 'filters',
    notes: visible.notes && flexible !== 'notes',
  };
  // A sized filters column always has a visible panel at its right (the flexible one); the same for a sized notes column at its left.
  const last = visibleCount(visible) === 1;
  return {
    visible: { ...visible },
    flexible,
    handles: { ...sized },
    disabled: { filters: last && visible.filters, lattice: last && visible.lattice, notes: last && visible.notes },
    frame: { sized, flexMinRem: flexible === 'lattice' ? LATTICE_MIN_REM : SIDE_MIN_REM },
  };
}
