// Widths of the filters column and the notes column. Pure: no DOM, no `obsidian`. All widths are in pixels; `rem` is the size of 1rem in pixels.

export interface ColumnWidths {
  filters: number;
  notes: number;
}

export type Side = keyof ColumnWidths;

/** The key of the stored widths (`App.saveLocalStorage`, per vault). */
export const COLUMN_WIDTHS_KEY = 'concept-atlas-column-widths';
/** The change of a width for one press of ArrowLeft or ArrowRight on a handle. */
export const COLUMN_STEP = 16;

const DEFAULT_REM: ColumnWidths = { filters: 15, notes: 17 };
const SIDE_MIN_REM = 10;
const SIDE_MAX_REM = 32;
const CENTER_MIN_REM = 16;

export function defaultWidth(side: Side, rem: number): number {
  return DEFAULT_REM[side] * rem;
}

export function defaultWidths(rem: number): ColumnWidths {
  return { filters: defaultWidth('filters', rem), notes: defaultWidth('notes', rem) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The range of one side column for a total width and the width of the other side column. The center column keeps at least 16rem. When the total is too small, the range is the minimum. */
export function columnRange(side: Side, widths: ColumnWidths, total: number, rem: number): { min: number; max: number } {
  const other = side === 'filters' ? widths.notes : widths.filters;
  const min = SIDE_MIN_REM * rem;
  const max = Math.max(min, Math.min(SIDE_MAX_REM * rem, total - other - CENTER_MIN_REM * rem));
  return { min, max };
}

/** Sets one side column to `value`, clamped to its range. */
export function setColumn(side: Side, value: number, widths: ColumnWidths, total: number, rem: number): ColumnWidths {
  const { min, max } = columnRange(side, widths, total, rem);
  return { ...widths, [side]: Math.round(clamp(value, min, max)) };
}

/** The keyboard step: ArrowRight moves the handle to the right. For the filters column this is wider, for the notes column narrower. */
export function stepColumn(side: Side, key: 'left' | 'right', widths: ColumnWidths, total: number, rem: number): ColumnWidths {
  const towardCenter = (side === 'filters') === (key === 'right');
  return setColumn(side, widths[side] + (towardCenter ? COLUMN_STEP : -COLUMN_STEP), widths, total, rem);
}

/** The widths that the view uses for a total width: each side from 10rem to 32rem; when the center column gets less than 16rem, the notes column and then the filters column become narrower, to 10rem at least. */
export function fitWidths(widths: ColumnWidths, total: number, rem: number): ColumnWidths {
  const min = SIDE_MIN_REM * rem;
  let filters = clamp(widths.filters, min, SIDE_MAX_REM * rem);
  let notes = clamp(widths.notes, min, SIDE_MAX_REM * rem);
  let excess = filters + notes - (total - CENTER_MIN_REM * rem);
  if (excess > 0) {
    const fromNotes = Math.min(excess, notes - min);
    notes -= fromNotes;
    excess -= fromNotes;
    filters -= Math.min(excess, filters - min);
  }
  return { filters: Math.round(filters), notes: Math.round(notes) };
}

/** Reads the stored widths. A missing or invalid value gives the default; a value outside 10rem to 32rem is clamped. */
export function readStoredWidths(raw: unknown, rem: number): ColumnWidths {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  const widths = defaultWidths(rem);
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  for (const side of ['filters', 'notes'] as const) {
    const v = record[side];
    if (typeof v === 'number' && Number.isFinite(v)) widths[side] = Math.round(clamp(v, SIDE_MIN_REM * rem, SIDE_MAX_REM * rem));
  }
  return widths;
}
