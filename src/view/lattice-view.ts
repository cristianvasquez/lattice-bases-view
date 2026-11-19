// The Bases view "Concept lattice". DOM code. The logic is in the pure modules state.ts, model.ts, layout.ts and text.ts.
import { BasesView, Keymap, type QueryController, setIcon } from 'obsidian';
import { type AtlasData, buildAtlasData } from '../bases';
import { type FormalContext, buildLattice } from '../fca';
import { COLUMN_WIDTHS_KEY, type ColumnWidths, type Side, columnRange, defaultWidth, fitWidths, readStoredWidths, setColumn, stepColumn } from './columns';
import { VIEW_TYPE, readViewConfig, viewFacets } from './config';
import { Diagram } from './diagram';
import { maxNodesPerLayer } from './layout';
import { type DisplayModel, buildModel, contextOf, neighbourFor, nodeNotePaths } from './model';
import { PANELS, PANELS_KEY, type Panel, type PanelLayout, type PanelVisibility, panelLayout, readStoredPanels, togglePanel } from './panels';
import {
  type ViewState,
  backFilter,
  clearFilters,
  filterToConcept,
  initialState,
  reconcileState,
  setFocus,
  setSearch,
  toggleValue,
} from './state';
import {
  EXPLANATION,
  HIGHLIGHT_HINT,
  NO_FILTER_MATCH_TEXT,
  type FullLatticeState,
  errorText,
  filterToText,
  focusCountText,
  fullLatticeText,
  noEntriesText,
  noSearchMatchText,
  noValuesText,
  notesCountText,
  notesText,
  shownText,
} from './text';

const NARROW_WIDTH = 700;

const PANEL_NAMES: Record<Panel, string> = { filters: 'Filters', lattice: 'Lattice', notes: 'Notes' };

/** Counter for element ids that are unique per view instance. */
let viewCount = 0;

/** Adds a region with a heading that is not visible. The heading gives the accessible name of the region (no `aria-label`, because Obsidian shows a tooltip for it). */
function createRegion(parent: HTMLElement, cls: string, id: string, name: string): HTMLDivElement {
  const region = parent.createDiv({ cls: `concept-atlas-region ${cls}`, attr: { role: 'region', 'aria-labelledby': id } });
  region.createEl('h2', { cls: 'concept-atlas-visually-hidden', text: name, attr: { id } });
  return region;
}

/** The size of 1rem in pixels. */
function remSize(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el.ownerDocument.documentElement).fontSize) || 16;
}

interface Loaded {
  data: AtlasData;
  ctx: FormalContext;
  warnings: string[];
  maxNodes: number;
}

export class ConceptLatticeView extends BasesView {
  readonly type = VIEW_TYPE;

  private readonly root: HTMLDivElement;
  private readonly searchInput: HTMLInputElement;
  private readonly groupsEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly warningsEl: HTMLDivElement;
  private readonly toolbarEl: HTMLDivElement;
  /** The toolbar button "Back": back to the previous filter. Disabled when the stack of previous filters is empty. */
  private readonly backButton: HTMLButtonElement;
  private readonly hintEl: HTMLDivElement;
  private readonly messageEl: HTMLDivElement;
  private readonly diagram: Diagram;
  /** The notes column at the right. It is always in the DOM, so that a change of its content does not change the size of the diagram viewport. */
  private readonly notesEl: HTMLDivElement;
  private readonly notesCountEl: HTMLDivElement;
  private readonly notesFocusEl: HTMLDivElement;
  private readonly notesMessageEl: HTMLDivElement;
  private readonly notesListEl: HTMLUListElement;
  private readonly mainEl: HTMLDivElement;
  /** The drag handles at the right of the filters column and at the left of the notes column. */
  private readonly handles: Record<Side, HTMLDivElement>;
  /** The widths that the user set (stored per vault). The view uses `fitWidths` of them for the current width. */
  private widths: ColumnWidths;
  /** The visible panels (stored per vault). */
  private panels: PanelVisibility;
  private readonly panelEls: Record<Panel, HTMLElement>;
  private readonly toggles: Record<Panel, HTMLButtonElement>;
  /** The scroll containers of each panel. Their scroll positions are kept while the panel is hidden. */
  private readonly scrollEls: Record<Panel, HTMLElement[]>;
  private readonly scrollTops = new Map<HTMLElement, number>();
  /** True when the model changed while the lattice was hidden: the diagram must be drawn again when it shows. */
  private diagramStale = false;

  private state: ViewState = initialState();
  private loaded: Loaded | null = null;
  private model: DisplayModel | null = null;
  private error: string | null = null;
  private lattice: FullLatticeState | null = null;
  private abort: AbortController | null = null;

  constructor(controller: QueryController, containerEl: HTMLElement) {
    super(controller);
    this.root = containerEl.createDiv({ cls: 'concept-atlas' });
    const idPrefix = `concept-atlas-view-${++viewCount}`;
    this.widths = readStoredWidths(this.app.loadLocalStorage(COLUMN_WIDTHS_KEY), remSize(this.root));
    this.panels = readStoredPanels(this.app.loadLocalStorage(PANELS_KEY));

    const panelBar = this.root.createDiv({ cls: 'concept-atlas-panel-bar', attr: { role: 'group', 'aria-labelledby': `${idPrefix}-panels` } });
    panelBar.createSpan({ cls: 'concept-atlas-visually-hidden', text: 'Panels', attr: { id: `${idPrefix}-panels` } });
    const toggles = {} as Record<Panel, HTMLButtonElement>;
    for (const panel of PANELS) {
      const button = panelBar.createEl('button', { cls: 'concept-atlas-panel-toggle', text: PANEL_NAMES[panel], attr: { 'data-panel': panel } });
      this.registerDomEvent(button, 'click', () => this.setPanels(togglePanel(this.panels, panel)));
      toggles[panel] = button;
    }
    this.toggles = toggles;

    const main = this.root.createDiv({ cls: 'concept-atlas-main' });
    this.mainEl = main;

    const filters = createRegion(main, 'concept-atlas-filters', `${idPrefix}-filters`, 'Filters');
    const clear = filters.createEl('button', { cls: 'concept-atlas-clear', text: 'Clear filters' });
    this.groupsEl = filters.createDiv({ cls: 'concept-atlas-groups' });
    const filtersHandle = this.createHandle(main, 'filters', `${idPrefix}-filters-handle`, 'Width of the filters column');

    const center = createRegion(main, 'concept-atlas-center', `${idPrefix}-diagram`, 'Concept diagram');
    this.statusEl = center.createDiv({ cls: 'concept-atlas-status', attr: { 'aria-live': 'polite' } });
    this.warningsEl = center.createDiv({ cls: 'concept-atlas-warnings' });
    this.toolbarEl = center.createDiv({ cls: 'concept-atlas-toolbar' });
    this.backButton = this.toolbarEl.createEl('button', { cls: 'concept-atlas-back', attr: { 'aria-label': 'Back to the previous filter' } });
    setIcon(this.backButton.createSpan({ cls: 'concept-atlas-back-icon' }), 'arrow-left');
    this.backButton.createSpan({ text: 'Back' });
    this.backButton.disabled = true;
    const zoomIn = this.toolbarEl.createEl('button', { text: '+', attr: { 'aria-label': 'Zoom in (Ctrl+scroll)' } });
    const zoomOut = this.toolbarEl.createEl('button', { text: '−', attr: { 'aria-label': 'Zoom out (Ctrl+scroll)' } });
    const fit = this.toolbarEl.createEl('button', { text: 'Fit', attr: { 'aria-label': 'Fit the diagram to the view' } });
    this.hintEl = center.createDiv({ cls: 'concept-atlas-hint', text: HIGHLIGHT_HINT });
    this.messageEl = center.createDiv({ cls: 'concept-atlas-message' });
    this.diagram = new Diagram(center, this, `${idPrefix}-diagram`, {
      activate: (index) => this.focusNode(index),
      toggleFilter: (index) => this.toggleFilter(index),
      key: (index, key) => this.onNodeKey(index, key),
      background: () => {
        if (this.state.focus !== null) this.update(setFocus(this.state, null));
      },
      marked: (index) => this.markNotes(index),
    });

    const notesHandle = this.createHandle(main, 'notes', `${idPrefix}-notes-handle`, 'Width of the notes column');
    this.handles = { filters: filtersHandle, notes: notesHandle };
    this.notesEl = createRegion(main, 'concept-atlas-notes-column', `${idPrefix}-notes`, 'Notes');
    this.searchInput = this.notesEl.createEl('input', {
      cls: 'concept-atlas-search',
      type: 'search',
      placeholder: 'Search note names',
      attr: { 'aria-label': 'Search note names' },
    });
    this.notesCountEl = this.notesEl.createDiv({ cls: 'concept-atlas-notes-count', attr: { 'aria-live': 'polite' } });
    this.notesFocusEl = this.notesEl.createDiv({ cls: 'concept-atlas-notes-focus' });
    this.notesMessageEl = this.notesEl.createDiv({ cls: 'concept-atlas-muted' });
    // The list is in a scroll container, so that a list with several columns (wide notes column) grows down and scrolls vertically.
    const notesScroll = this.notesEl.createDiv({ cls: 'concept-atlas-notes-scroll' });
    this.notesListEl = notesScroll.createEl('ul', { cls: 'concept-atlas-notes' });
    this.panelEls = { filters, lattice: center, notes: this.notesEl };
    this.scrollEls = { filters: [filters], lattice: [], notes: [notesScroll] };

    const footer = this.root.createEl('details', { cls: 'concept-atlas-footer' });
    footer.createEl('summary', { text: 'What the lattice shows' });
    footer.createEl('p', { text: EXPLANATION });

    this.registerDomEvent(this.searchInput, 'input', () => this.update(setSearch(this.state, this.searchInput.value)));
    this.registerDomEvent(clear, 'click', () => this.update(clearFilters(this.state)));
    this.registerDomEvent(this.groupsEl, 'change', (ev) => {
      const target = ev.target;
      if (target instanceof HTMLInputElement && target.dataset.attribute) this.update(toggleValue(this.state, target.dataset.attribute));
    });
    this.registerDomEvent(this.backButton, 'click', () => this.back());
    this.registerDomEvent(zoomIn, 'click', () => this.diagram.zoomBy(1.25));
    this.registerDomEvent(zoomOut, 'click', () => this.diagram.zoomBy(0.8));
    this.registerDomEvent(fit, 'click', () => this.diagram.fit());
    this.registerDomEvent(this.notesEl, 'click', (ev) => this.onNotesClick(ev));

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? this.root.clientWidth;
      this.root.toggleClass('is-narrow', width > 0 && width < NARROW_WIDTH);
      this.applyWidths();
    });
    this.applyPanels();
    observer.observe(this.root);
    this.register(() => observer.disconnect());
    // Fits the diagram when the viewport gets a new size: a resize of the window or the pane, or the narrow mode. A change of the filter, the focus, the hover or the search does not change the size of the viewport: the notes column is always in the DOM and has a fixed width.
    // When the new width gives a new number of nodes per layer, the layout is computed again and the diagram is drawn again (and fitted).
    const viewportObserver = new ResizeObserver(() => {
      if (!this.panels.lattice) return;
      if (this.relayout() && this.model?.kind === 'ok') this.diagram.render(this.model, null);
      else this.diagram.resized();
    });
    viewportObserver.observe(this.diagram.viewport);
    this.register(() => viewportObserver.disconnect());
    this.register(() => this.cancelLattice());
  }

  override onunload(): void {
    this.cancelLattice();
    this.root.remove();
  }

  override onDataUpdated(): void {
    this.cancelLattice();
    try {
      const config = readViewConfig((key) => this.config.get(key));
      // The facets are the properties that the user selected in the Properties menu of the base.
      const resolved = viewFacets({
        order: this.config.getOrder(),
        displayName: (id) => this.config.getDisplayName(id),
        legacy: this.config.get('facets'),
        allProperties: this.allProperties ?? [],
      });
      const data = buildAtlasData(this.data.data, resolved.facets);
      const ctx = contextOf(data);
      this.model = null;
      this.loaded = { data, ctx, warnings: [...resolved.warnings, ...data.warnings], maxNodes: config.maxNodes };
      this.state = reconcileState(this.state, data);
      this.error = null;
      if (data.objects.length > 0 && data.attributes.length > 0) this.startLattice(ctx, config.maxConcepts);
      else this.lattice = null;
    } catch (err) {
      this.loaded = null;
      this.error = err instanceof Error ? err.message : String(err);
    }
    this.render(null);
  }

  private cancelLattice(): void {
    this.abort?.abort();
    this.abort = null;
  }

  private startLattice(ctx: FormalContext, maxConcepts: number): void {
    const controller = new AbortController();
    this.abort = controller;
    this.lattice = { kind: 'running' };
    buildLattice(ctx, { maxConcepts, signal: controller.signal, covers: false })
      .then((result) => {
        if (controller.signal.aborted || result.status === 'cancelled') return;
        this.lattice = { kind: result.status, count: result.concepts.length };
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        this.lattice = { kind: 'error', message: err instanceof Error ? err.message : String(err) };
      })
      .finally(() => {
        if (this.abort === controller) {
          this.abort = null;
          this.renderStatus();
        }
      });
  }

  private update(next: ViewState, domFocus: number | null = null): void {
    this.state = next;
    this.render(domFocus);
  }

  private focusNode(index: number): void {
    const node = this.model?.nodes[index];
    if (node) this.update(setFocus(this.state, node.intent), index);
  }

  private onNodeKey(index: number, key: 'up' | 'down' | 'left' | 'right' | 'escape'): void {
    if (!this.model) return;
    if (key === 'escape') {
      this.update(setFocus(this.state, null), index);
      return;
    }
    const next = neighbourFor(this.model, index, key);
    if (next !== null) this.focusNode(next);
  }

  /** Double-click or Shift+Enter on a node. On a node that is not the start node: filter to its concept. On the start node: back to the previous filter, if there is one. The start node of the new diagram gets the keyboard focus. */
  private toggleFilter(index: number): void {
    const node = this.model?.nodes[index];
    if (!node) return;
    if (!node.isStart) this.update(filterToConcept(this.state, node.intent), 0);
    else this.back();
  }

  /** The button "Back", or a double-click or Shift+Enter on the start node: back to the previous filter, if there is one. The start node of the new diagram gets the keyboard focus. */
  private back(): void {
    if (this.state.previous.length > 0) this.update(backFilter(this.state), 0);
  }

  /** The viewport width for the layout: 0 (no limit) while the lattice is hidden. */
  private viewportWidth(): number {
    return this.panels.lattice ? this.diagram.viewport.clientWidth : 0;
  }

  /** Builds the model again when the viewport width gives a new number of nodes per layer. The part is used again. Returns true when the layout changed. */
  private relayout(): boolean {
    const model = this.model;
    if (!this.loaded || model?.kind !== 'ok') return false;
    const viewportWidth = this.viewportWidth();
    if (maxNodesPerLayer(viewportWidth, model.nodeWidth) === model.maxPerLayer) return false;
    this.model = buildModel(this.loaded.data, this.loaded.ctx, this.state, { maxNodes: this.loaded.maxNodes, part: model.part, viewportWidth });
    return true;
  }

  /** Adds a drag handle that changes the width of a side column. It is a focusable separator: ArrowLeft and ArrowRight change the width; a double-click restores the default width. */
  private createHandle(parent: HTMLElement, side: Side, id: string, name: string): HTMLDivElement {
    const handle = parent.createDiv({
      cls: `concept-atlas-handle concept-atlas-handle-${side}`,
      attr: { role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-labelledby': id },
    });
    handle.createSpan({ cls: 'concept-atlas-visually-hidden', text: name, attr: { id } });
    let drag: { id: number; x: number; width: number } | null = null;
    this.registerDomEvent(handle, 'pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      handle.addClass('is-dragging');
      drag = { id: ev.pointerId, x: ev.clientX, width: this.effectiveWidths()[side] };
    });
    this.registerDomEvent(handle, 'pointermove', (ev) => {
      if (!drag || drag.id !== ev.pointerId) return;
      const dx = ev.clientX - drag.x;
      this.setWidth(side, drag.width + (side === 'filters' ? dx : -dx), false);
    });
    const end = (ev: PointerEvent) => {
      if (!drag || drag.id !== ev.pointerId) return;
      drag = null;
      if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
      handle.removeClass('is-dragging');
      this.saveWidths();
    };
    this.registerDomEvent(handle, 'pointerup', end);
    this.registerDomEvent(handle, 'pointercancel', end);
    this.registerDomEvent(handle, 'dblclick', () => this.setWidth(side, defaultWidth(side, remSize(this.root)), true));
    this.registerDomEvent(handle, 'keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const next = stepColumn(side, ev.key === 'ArrowLeft' ? 'left' : 'right', this.effectiveWidths(), this.mainEl.clientWidth, remSize(this.root), this.panelLayout().frame);
      this.setWidth(side, next[side], true);
    });
    return handle;
  }

  private panelLayout(): PanelLayout {
    return panelLayout(this.panels);
  }

  /** Hides or shows panels, stores the flags and fits the diagram when the lattice shows again. */
  private setPanels(next: PanelVisibility): void {
    if (PANELS.every((p) => next[p] === this.panels[p])) return;
    const latticeShown = next.lattice && !this.panels.lattice;
    for (const panel of PANELS) {
      if (this.panels[panel] && !next[panel]) for (const el of this.scrollEls[panel]) this.scrollTops.set(el, el.scrollTop);
    }
    this.panels = next;
    this.app.saveLocalStorage(PANELS_KEY, next);
    this.applyPanels();
    for (const panel of PANELS) {
      if (!next[panel]) continue;
      for (const el of this.scrollEls[panel]) {
        const top = this.scrollTops.get(el);
        if (top !== undefined) el.scrollTop = top;
        this.scrollTops.delete(el);
      }
    }
    if (latticeShown) {
      const relaid = this.relayout();
      const model = this.model;
      if (model?.kind === 'ok') {
        if (this.diagramStale || relaid) this.diagram.render(model, null);
        else this.diagram.setFocus(model.focusIndex, null);
      }
      this.diagramStale = false;
      this.diagram.fit();
    }
  }

  /** Shows the visible panels and the handles between them, and sets the states of the toggles. A hidden panel is `display: none`: it keeps its DOM and its state. */
  private applyPanels(): void {
    const layout = this.panelLayout();
    for (const panel of PANELS) {
      this.panelEls[panel].toggleClass('is-hidden', !layout.visible[panel]);
      const toggle = this.toggles[panel];
      toggle.setAttr('aria-pressed', layout.visible[panel] ? 'true' : 'false');
      toggle.toggleClass('is-active', layout.visible[panel]);
      toggle.disabled = layout.disabled[panel];
    }
    for (const side of ['filters', 'notes'] as const) this.handles[side].toggleClass('is-hidden', !layout.handles[side]);
    this.applyWidths();
  }

  /** The widths for the current width of the view. */
  private effectiveWidths(): ColumnWidths {
    return fitWidths(this.widths, this.mainEl.clientWidth, remSize(this.root), this.panelLayout().frame);
  }

  /** Sets the width of one side column, clamped to its range, and stores the widths when `save` is true. */
  private setWidth(side: Side, value: number, save: boolean): void {
    const next = setColumn(side, value, this.effectiveWidths(), this.mainEl.clientWidth, remSize(this.root), this.panelLayout().frame);
    this.widths = { ...this.widths, [side]: next[side] };
    this.applyWidths();
    if (save) this.saveWidths();
  }

  private saveWidths(): void {
    this.app.saveLocalStorage(COLUMN_WIDTHS_KEY, this.widths);
  }

  /** Sets the grid tracks of the panels, the column widths and the values of the handles. The CSS uses the tracks only in the wide layout. A hidden panel has a track with no width; the flexible panel takes the remaining width. */
  private applyWidths(): void {
    const layout = this.panelLayout();
    const total = this.mainEl.clientWidth;
    const rem = remSize(this.root);
    const widths = total > 0 ? fitWidths(this.widths, total, rem, layout.frame) : this.widths;
    const track = (panel: Panel, width: number): string => {
      if (!layout.visible[panel]) return '0px';
      return panel === layout.flexible ? 'minmax(0, 1fr)' : `${width}px`;
    };
    this.mainEl.setCssProps({
      '--concept-atlas-filters-track': track('filters', widths.filters),
      '--concept-atlas-lattice-track': track('lattice', 0),
      '--concept-atlas-notes-track': track('notes', widths.notes),
    });
    if (total <= 0) return;
    for (const side of ['filters', 'notes'] as const) {
      const { min, max } = columnRange(side, widths, total, rem, layout.frame);
      this.handles[side].setAttrs({ 'aria-valuenow': widths[side], 'aria-valuemin': min, 'aria-valuemax': max });
    }
  }

  private onNotesClick(ev: MouseEvent): void {
    const target = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-path], [data-action]') : null;
    if (!target) return;
    if (target.dataset.path !== undefined) {
      ev.preventDefault();
      void this.app.workspace.openLinkText(target.dataset.path, '', Keymap.isModEvent(ev));
    } else if (target.dataset.action === 'filter-to' && this.model?.notes?.focus) {
      // The start node of the new diagram (index 0) gets the keyboard focus; the button is removed.
      this.update(filterToConcept(this.state, this.model.notes.focus.intent), 0);
    }
  }

  private render(domFocus: number | null): void {
    if (this.searchInput.value !== this.state.search) this.searchInput.value = this.state.search;
    const previousPart = this.model?.part ?? null;
    const previousMaxPerLayer = this.model?.maxPerLayer ?? null;
    this.model = null;
    let message = this.error === null ? null : errorText(this.error);
    if (message === null && this.loaded) {
      try {
        const model = buildModel(this.loaded.data, this.loaded.ctx, this.state, {
          maxNodes: this.loaded.maxNodes,
          part: previousPart,
          viewportWidth: this.viewportWidth(),
        });
        this.state = model.state;
        this.model = model;
        if (model.kind === 'no-entries') message = noEntriesText();
        else if (model.kind === 'no-values') message = noValuesText(model.facets);
      } catch (err) {
        message = errorText(err instanceof Error ? err.message : String(err));
      }
    }

    const model = this.model;
    const ok = model?.kind === 'ok';
    // The filters and the diagram depend only on the part. A search or focus change keeps them and their DOM.
    const partChanged = model?.part == null || model.part !== previousPart;
    // A new number of nodes per layer gives a new layout of the same part.
    const layoutChanged = partChanged || model?.maxPerLayer !== previousMaxPerLayer;
    this.backButton.disabled = this.state.previous.length === 0;
    this.messageEl.toggleClass('is-hidden', message === null);
    this.messageEl.setText(message ?? '');
    this.toolbarEl.toggleClass('is-hidden', !ok);
    this.hintEl.toggleClass('is-hidden', !ok);
    this.diagram.viewport.toggleClass('is-hidden', !ok);
    if (partChanged) keepFocus(this.groupsEl, ['data-attribute'], () => this.renderFilters());
    this.renderStatus();
    this.renderWarnings();
    // Before the diagram: the diagram calls markNotes() on the new list elements.
    keepFocus(this.notesEl, ['data-path', 'data-action'], () => this.renderNotes());
    // While the lattice is hidden, the diagram is not drawn (and the layout is not computed). It is drawn when the lattice shows again.
    if (!this.panels.lattice) this.diagramStale = this.diagramStale || (ok && partChanged);
    else if (ok && layoutChanged) this.diagram.render(model, domFocus);
    else if (ok) this.diagram.setFocus(model.focusIndex, domFocus);
  }

  private renderStatus(): void {
    this.statusEl.empty();
    const model = this.model;
    if (!model || model.kind !== 'ok') return;
    if (this.lattice) this.statusEl.createDiv({ cls: 'concept-atlas-status-full', text: fullLatticeText(this.lattice) });
    this.statusEl.createDiv({ cls: 'concept-atlas-status-shown', text: shownText(model.nodes.length, model.truncated) });
  }

  private renderWarnings(): void {
    this.warningsEl.empty();
    for (const warning of this.loaded?.warnings ?? []) this.warningsEl.createDiv({ cls: 'concept-atlas-warning', text: warning });
  }

  private renderFilters(): void {
    this.groupsEl.empty();
    const model = this.model;
    if (!model || model.kind !== 'ok') return;
    for (const group of model.groups) {
      const fieldset = this.groupsEl.createEl('fieldset', { cls: 'concept-atlas-group' });
      fieldset.createEl('legend', { text: group.name });
      for (const value of group.values) {
        const label = fieldset.createEl('label', { cls: 'concept-atlas-value' });
        label.toggleClass('is-disabled', value.disabled);
        label.toggleClass('is-shared', value.shared);
        const box = label.createEl('input', { type: 'checkbox', attr: { 'data-attribute': value.id } });
        box.checked = value.selected;
        box.disabled = value.disabled;
        label.createSpan({ cls: 'concept-atlas-value-label', text: value.label, attr: { title: value.fullLabel } });
        label.createSpan({ cls: 'concept-atlas-value-count', text: String(value.count), attr: { 'aria-label': notesText(value.count) } });
        if (value.shared) label.createSpan({ cls: 'concept-atlas-value-shared', text: 'shared by all matching notes' });
      }
    }
  }

  private renderNotes(): void {
    this.notesFocusEl.empty();
    this.notesListEl.empty();
    const model = this.model;
    const notes = model?.kind === 'ok' ? model.notes : null;
    this.notesCountEl.setText(notes ? notesCountText(notes.total, notes.filterActive, notes.search === '' ? null : notes.items.length) : '');
    let message: string | null = null;
    if (notes && notes.total === 0) message = NO_FILTER_MATCH_TEXT;
    else if (notes && notes.items.length === 0) message = noSearchMatchText(notes.search);
    this.notesMessageEl.toggleClass('is-hidden', message === null);
    this.notesMessageEl.setText(message ?? '');
    if (!notes) return;

    if (notes.focus) {
      // One short line: a link when the filter can change to the focused concept, else a plain text.
      if (notes.focus.canFilterTo) {
        this.notesFocusEl.createEl('button', {
          cls: 'concept-atlas-filter-to',
          text: filterToText(notes.focus.support),
          attr: { 'data-action': 'filter-to', 'aria-label': `${focusCountText(notes.focus.support)}. Set the filter to this concept.` },
        });
      } else {
        this.notesFocusEl.createSpan({ text: focusCountText(notes.focus.support) });
      }
    }
    for (const note of notes.items) {
      const item = this.notesListEl.createEl('li', { cls: 'concept-atlas-note', attr: { 'data-note': note.path } });
      item.toggleClass('is-in-concept', note.inConcept);
      item.createEl('a', { cls: 'internal-link', text: note.name, href: note.path, attr: { 'data-path': note.path, title: note.name } });
    }
    this.notesListEl.toggleClass('has-marks', notes.focus !== null);
  }

  /** Marks the notes of a displayed node in the list, with class changes only: no new render, no change of order, no scroll. `null` removes the marks. */
  private markNotes(index: number | null): void {
    const node = index === null ? undefined : this.model?.nodes[index];
    const paths = node && this.loaded ? nodeNotePaths(this.loaded.ctx, node) : null;
    this.notesListEl.toggleClass('has-marks', paths !== null);
    for (const item of Array.from(this.notesListEl.children)) {
      if (item instanceof HTMLElement) item.toggleClass('is-in-concept', paths?.has(item.dataset.note ?? '') ?? false);
    }
  }
}

/** Runs `render` and gives the keyboard focus back to the new element with the same value of one of `attrs`. */
function keepFocus(container: HTMLElement, attrs: string[], render: () => void): void {
  const active = document.activeElement;
  let selector: string | null = null;
  if (active instanceof HTMLElement && container.contains(active)) {
    const attr = attrs.find((a) => active.hasAttribute(a));
    if (attr) selector = `[${attr}="${CSS.escape(active.getAttribute(attr)!)}"]`;
  }
  render();
  if (selector) container.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
}
