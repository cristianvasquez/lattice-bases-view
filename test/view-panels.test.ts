import { describe, expect, it } from 'vitest';
import { LATTICE_MIN_REM, SIDE_MIN_REM } from '../src/view/columns';
import { type PanelVisibility, allVisible, panelLayout, readStoredPanels, togglePanel } from '../src/view/panels';

function vis(filters: boolean, lattice: boolean, notes: boolean): PanelVisibility {
  return { filters, lattice, notes };
}

describe('panel visibility', () => {
  it('toggles a panel and keeps the last visible panel', () => {
    expect(togglePanel(allVisible(), 'filters')).toEqual(vis(false, true, true));
    expect(togglePanel(vis(false, true, true), 'filters')).toEqual(allVisible());
    expect(togglePanel(vis(false, true, false), 'lattice')).toEqual(vis(false, true, false));
    expect(togglePanel(vis(false, true, false), 'notes')).toEqual(vis(false, true, true));
  });

  it('reads stored flags; data that is not valid gives all panels visible', () => {
    expect(readStoredPanels({ filters: false, lattice: true, notes: false })).toEqual(vis(false, true, false));
    expect(readStoredPanels('{"filters":true,"lattice":false,"notes":true}')).toEqual(vis(true, false, true));
    expect(readStoredPanels(null)).toEqual(allVisible());
    expect(readStoredPanels('not json')).toEqual(allVisible());
    expect(readStoredPanels({ filters: false, lattice: true })).toEqual(allVisible());
    expect(readStoredPanels({ filters: 0, lattice: true, notes: true })).toEqual(allVisible());
    expect(readStoredPanels({ filters: false, lattice: false, notes: false })).toEqual(allVisible());
  });
});

describe('panel layout', () => {
  it('all visible: the lattice is flexible, both handles show, no toggle is disabled', () => {
    const l = panelLayout(allVisible());
    expect(l.flexible).toBe('lattice');
    expect(l.handles).toEqual({ filters: true, notes: true });
    expect(l.disabled).toEqual({ filters: false, lattice: false, notes: false });
    expect(l.frame).toEqual({ sized: { filters: true, notes: true }, flexMinRem: LATTICE_MIN_REM });
  });

  it('lattice visible with one side column: only the handle of that column shows', () => {
    expect(panelLayout(vis(true, true, false)).handles).toEqual({ filters: true, notes: false });
    expect(panelLayout(vis(false, true, true)).handles).toEqual({ filters: false, notes: true });
    expect(panelLayout(vis(false, true, true)).frame.sized).toEqual({ filters: false, notes: true });
  });

  it('lattice hidden: the notes column is flexible and the filters handle resizes the filters column', () => {
    const l = panelLayout(vis(true, false, true));
    expect(l.flexible).toBe('notes');
    expect(l.handles).toEqual({ filters: true, notes: false });
    expect(l.frame).toEqual({ sized: { filters: true, notes: false }, flexMinRem: SIDE_MIN_REM });
    expect(l.disabled).toEqual({ filters: false, lattice: false, notes: false });
  });

  it('one panel visible: it is flexible, no handle shows, its toggle is disabled', () => {
    for (const [v, panel] of [
      [vis(true, false, false), 'filters'],
      [vis(false, true, false), 'lattice'],
      [vis(false, false, true), 'notes'],
    ] as const) {
      const l = panelLayout(v);
      expect(l.flexible).toBe(panel);
      expect(l.handles).toEqual({ filters: false, notes: false });
      expect(l.frame.sized).toEqual({ filters: false, notes: false });
      expect(l.disabled).toEqual({ filters: panel === 'filters', lattice: panel === 'lattice', notes: panel === 'notes' });
    }
  });
});
