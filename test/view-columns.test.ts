import { describe, expect, it } from 'vitest';
import { COLUMN_STEP, columnRange, defaultWidths, fitWidths, readStoredWidths, setColumn, stepColumn } from '../src/view/columns';

const rem = 16;
const total = 1600;

describe('column widths', () => {
  it('has the defaults 15rem and 17rem', () => {
    expect(defaultWidths(rem)).toEqual({ filters: 240, notes: 272 });
  });

  it('clamps a side column to 10rem .. 32rem', () => {
    const w = defaultWidths(rem);
    expect(setColumn('filters', 50, w, total, rem).filters).toBe(160);
    expect(setColumn('filters', 900, w, total, rem).filters).toBe(512);
    expect(setColumn('notes', 300, w, total, rem)).toEqual({ filters: 240, notes: 300 });
  });

  it('keeps at least 16rem for the center column', () => {
    const w = { filters: 400, notes: 400 };
    // 900 - 400 - 256 = 244
    expect(columnRange('filters', w, 900, rem)).toEqual({ min: 160, max: 244 });
    expect(setColumn('filters', 500, w, 900, rem).filters).toBe(244);
    // Too small a total: the range is the minimum.
    expect(columnRange('notes', w, 500, rem)).toEqual({ min: 160, max: 160 });
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
    // Room for the side columns: 1000 - 256 = 744.
    expect(fitWidths(w, 1000, rem)).toEqual({ filters: 400, notes: 344 });
    // 700 - 256 = 444: notes to 160, filters to 284.
    expect(fitWidths(w, 700, rem)).toEqual({ filters: 284, notes: 160 });
    expect(fitWidths(w, 400, rem)).toEqual({ filters: 160, notes: 160 });
  });

  it('reads stored widths and clamps values outside the limits', () => {
    expect(readStoredWidths(null, rem)).toEqual(defaultWidths(rem));
    expect(readStoredWidths('not json', rem)).toEqual(defaultWidths(rem));
    expect(readStoredWidths({ filters: 10, notes: 9999 }, rem)).toEqual({ filters: 160, notes: 512 });
    expect(readStoredWidths('{"filters":300}', rem)).toEqual({ filters: 300, notes: 272 });
    expect(readStoredWidths({ filters: 'x', notes: Number.NaN }, rem)).toEqual(defaultWidths(rem));
  });
});
