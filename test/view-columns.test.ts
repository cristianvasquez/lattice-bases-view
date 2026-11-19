import { describe, expect, it } from 'vitest';
import { COLUMN_STEP, type ColumnFrame, columnRange, defaultWidths, fitWidths, readStoredWidths, setColumn, stepColumn } from '../src/view/columns';

const rem = 16;
const total = 1600;
/** Lattice hidden: the filters column has a set width, the notes column takes the remaining width (10rem at least). */
const notesFlexible: ColumnFrame = { sized: { filters: true, notes: false }, flexMinRem: 10 };

describe('column widths', () => {
  it('has the defaults 15rem and 17rem', () => {
    expect(defaultWidths(rem)).toEqual({ filters: 240, notes: 272 });
  });

  it('clamps a side column to 10rem and to the room that the other columns leave, with no fixed maximum', () => {
    const w = defaultWidths(rem);
    expect(setColumn('filters', 50, w, total, rem).filters).toBe(160);
    expect(setColumn('filters', 900, w, total, rem).filters).toBe(900);
    // 1600 - 272 - 192 = 1136
    expect(setColumn('filters', 1500, w, total, rem).filters).toBe(1136);
    expect(setColumn('notes', 300, w, total, rem)).toEqual({ filters: 240, notes: 300 });
  });

  it('keeps at least 12rem for the lattice column', () => {
    const w = { filters: 400, notes: 400 };
    // 900 - 400 - 192 = 308
    expect(columnRange('filters', w, 900, rem)).toEqual({ min: 160, max: 308 });
    expect(setColumn('filters', 500, w, 900, rem).filters).toBe(308);
    // Too small a total: the range is the minimum.
    expect(columnRange('notes', w, 500, rem)).toEqual({ min: 160, max: 160 });
  });

  it('ignores a side column with no set width and uses the minimum of the flexible column', () => {
    const w = { filters: 400, notes: 400 };
    // 900 - 0 - 160 = 740
    expect(columnRange('filters', w, 900, rem, notesFlexible)).toEqual({ min: 160, max: 740 });
    expect(fitWidths({ filters: 900, notes: 400 }, 900, rem, notesFlexible)).toEqual({ filters: 740, notes: 400 });
    // No set width: the value stays.
    expect(fitWidths(w, 300, rem, { sized: { filters: false, notes: false }, flexMinRem: 10 })).toEqual(w);
  });

  it('moves the handle by the keyboard step', () => {
    const w = defaultWidths(rem);
    expect(stepColumn('filters', 'right', w, total, rem).filters).toBe(240 + COLUMN_STEP);
    expect(stepColumn('filters', 'left', w, total, rem).filters).toBe(240 - COLUMN_STEP);
    expect(stepColumn('notes', 'right', w, total, rem).notes).toBe(272 - COLUMN_STEP);
    expect(stepColumn('notes', 'left', w, total, rem).notes).toBe(272 + COLUMN_STEP);
    expect(stepColumn('filters', 'left', { filters: 160, notes: 272 }, total, rem).filters).toBe(160);
  });

  it('fits the widths to a smaller total: the notes column first, then the filters column', () => {
    const w = { filters: 400, notes: 400 };
    expect(fitWidths(w, total, rem)).toEqual(w);
    // Room for the side columns: 1000 - 192 = 808.
    expect(fitWidths(w, 1000, rem)).toEqual(w);
    // 900 - 192 = 708: notes to 308.
    expect(fitWidths(w, 900, rem)).toEqual({ filters: 400, notes: 308 });
    // 700 - 192 = 508: notes to 160, filters to 348.
    expect(fitWidths(w, 700, rem)).toEqual({ filters: 348, notes: 160 });
    expect(fitWidths(w, 400, rem)).toEqual({ filters: 160, notes: 160 });
    // Wide side columns stay wide when there is room.
    expect(fitWidths({ filters: 900, notes: 1000 }, 2500, rem)).toEqual({ filters: 900, notes: 1000 });
  });

  it('reads stored widths and sets values below 10rem to 10rem', () => {
    expect(readStoredWidths(null, rem)).toEqual(defaultWidths(rem));
    expect(readStoredWidths('not json', rem)).toEqual(defaultWidths(rem));
    expect(readStoredWidths({ filters: 10, notes: 9999 }, rem)).toEqual({ filters: 160, notes: 9999 });
    expect(readStoredWidths('{"filters":300}', rem)).toEqual({ filters: 300, notes: 272 });
    expect(readStoredWidths({ filters: 'x', notes: Number.NaN }, rem)).toEqual(defaultWidths(rem));
  });
});
