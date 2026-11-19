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
/** The minimum of a side column, in rem. */
export const SIDE_MIN_REM = 10;
/** The minimum of the lattice column, in rem. */
export const LATTICE_MIN_REM = 12;

/**
 * Which side columns have a set width, and the minimum of the flexible column (the column that takes the remaining width), in rem.
 * Default: both side columns have a set width and the lattice column is flexible.
 */
export interface ColumnFrame {
  sized: Record<Side, boolean>;
  flexMinRem: number;
}

export const DEFAULT_FRAME: ColumnFrame = { sized: { filters: true, notes: true }, flexMinRem: LATTICE_MIN_REM };

export function defaultWidth(side: Side, rem: number): number {
  return DEFAULT_REM[side] * rem;
}

export function defaultWidths(rem: number): ColumnWidths {
  return { filters: defaultWidth('filters', rem), notes: defaultWidth('notes', rem) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function otherSide(side: Side): Side {
  return side === 'filters' ? 'notes' : 'filters';
}

/** The range of one side column for a total width and the width of the other side column. The maximum is the total minus the other side column (when it has a set width) minus the minimum of the flexible column. When the total is too small, the range is the minimum. */
export function columnRange(side: Side, widths: ColumnWidths, total: number, rem: number, frame: ColumnFrame = DEFAULT_FRAME): { min: number; max: number } {
  const other = otherSide(side);
  const otherWidth = frame.sized[other] ? widths[other] : 0;
  const min = SIDE_MIN_REM * rem;
  const max = Math.max(min, total - otherWidth - frame.flexMinRem * rem);
  return { min, max };
}

/** Sets one side column to `value`, clamped to its range. */
export function setColumn(side: Side, value: number, widths: ColumnWidths, total: number, rem: number, frame: ColumnFrame = DEFAULT_FRAME): ColumnWidths {
  const { min, max } = columnRange(side, widths, total, rem, frame);
  return { ...widths, [side]: Math.round(clamp(value, min, max)) };
}

/** The keyboard step: ArrowRight moves the handle to the right. For the filters column this is wider, for the notes column narrower. */
export function stepColumn(side: Side, key: 'left' | 'right', widths: ColumnWidths, total: number, rem: number, frame: ColumnFrame = DEFAULT_FRAME): ColumnWidths {
  const towardCenter = (side === 'filters') === (key === 'right');
  return setColumn(side, widths[side] + (towardCenter ? COLUMN_STEP : -COLUMN_STEP), widths, total, rem, frame);
}

/** The widths that the view uses for a total width: each side column 10rem at least; when the flexible column gets less than its minimum, the notes column and then the filters column become narrower, to 10rem at least. A side column with no set width keeps its value. */
export function fitWidths(widths: ColumnWidths, total: number, rem: number, frame: ColumnFrame = DEFAULT_FRAME): ColumnWidths {
  const min = SIDE_MIN_REM * rem;
  let filters = Math.max(min, widths.filters);
  let notes = Math.max(min, widths.notes);
  let excess = (frame.sized.filters ? filters : 0) + (frame.sized.notes ? notes : 0) - (total - frame.flexMinRem * rem);
  if (excess > 0 && frame.sized.notes) {
    const fromNotes = Math.min(excess, notes - min);
    notes -= fromNotes;
    excess -= fromNotes;
  }
  if (excess > 0 && frame.sized.filters) filters -= Math.min(excess, filters - min);
  return { filters: Math.round(filters), notes: Math.round(notes) };
}

/** Reads the stored widths. A missing or invalid value gives the default; a value below 10rem is set to 10rem. */
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
    if (typeof v === 'number' && Number.isFinite(v)) widths[side] = Math.round(Math.max(SIDE_MIN_REM * rem, v));
  }
  return widths;
}
