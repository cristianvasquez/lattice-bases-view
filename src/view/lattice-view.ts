// The Bases view "Concept lattice". DOM code. The logic is in the pure modules state.ts, model.ts, layout.ts and text.ts.
import { BasesView, Keymap, type QueryController } from 'obsidian';
import { type AtlasData, buildAtlasData, resolveFacets } from '../bases';
import { type FormalContext, buildLattice } from '../fca';
import { VIEW_TYPE, readViewConfig } from './config';
import { Diagram } from './diagram';
import { type DisplayModel, buildModel, contextOf, neighbourFor, nodeNotePaths } from './model';
import {
  type ViewState,
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

/** Counter for element ids that are unique per view instance. */
let viewCount = 0;

/** Adds a region with a heading that is not visible. The heading gives the accessible name of the region (no `aria-label`, because Obsidian shows a tooltip for it). */
function createRegion(parent: HTMLElement, cls: string, id: string, name: string): HTMLDivElement {
  const region = parent.createDiv({ cls: `concept-atlas-region ${cls}`, attr: { role: 'region', 'aria-labelledby': id } });
  region.createEl('h2', { cls: 'concept-atlas-visually-hidden', text: name, attr: { id } });
  return region;
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
  private readonly hintEl: HTMLDivElement;
  private readonly messageEl: HTMLDivElement;
  private readonly diagram: Diagram;
  /** The notes column at the right. It is always in the DOM, so that a change of its content does not change the size of the diagram viewport. */
  private readonly notesEl: HTMLDivElement;
  private readonly notesCountEl: HTMLDivElement;
  private readonly notesFocusEl: HTMLDivElement;
  private readonly notesMessageEl: HTMLDivElement;
  private readonly notesListEl: HTMLUListElement;

  private state: ViewState = initialState();
  private loaded: Loaded | null = null;
  private model: DisplayModel | null = null;
  private error: string | null = null;
  private lattice: FullLatticeState | null = null;
  private abort: AbortController | null = null;

  constructor(controller: QueryController, containerEl: HTMLElement) {
    super(controller);
    this.root = containerEl.createDiv({ cls: 'concept-atlas' });
    const main = this.root.createDiv({ cls: 'concept-atlas-main' });
    const idPrefix = `concept-atlas-view-${++viewCount}`;

    const filters = createRegion(main, 'concept-atlas-filters', `${idPrefix}-filters`, 'Filters');
    const clear = filters.createEl('button', { cls: 'concept-atlas-clear', text: 'Clear filters' });
    this.groupsEl = filters.createDiv({ cls: 'concept-atlas-groups' });

    const center = createRegion(main, 'concept-atlas-center', `${idPrefix}-diagram`, 'Concept diagram');
    this.statusEl = center.createDiv({ cls: 'concept-atlas-status', attr: { 'aria-live': 'polite' } });
    this.warningsEl = center.createDiv({ cls: 'concept-atlas-warnings' });
    this.toolbarEl = center.createDiv({ cls: 'concept-atlas-toolbar' });
    const zoomIn = this.toolbarEl.createEl('button', { text: '+', attr: { 'aria-label': 'Zoom in' } });
    const zoomOut = this.toolbarEl.createEl('button', { text: '−', attr: { 'aria-label': 'Zoom out' } });
    const fit = this.toolbarEl.createEl('button', { text: 'Fit', attr: { 'aria-label': 'Fit the diagram to the view' } });
    this.hintEl = center.createDiv({ cls: 'concept-atlas-hint', text: HIGHLIGHT_HINT });
    this.messageEl = center.createDiv({ cls: 'concept-atlas-message' });
    this.diagram = new Diagram(center, this, `${idPrefix}-diagram`, {
      activate: (index) => this.focusNode(index),
      key: (index, key) => this.onNodeKey(index, key),
      background: () => {
        if (this.state.focus !== null) this.update(setFocus(this.state, null));
      },
      marked: (index) => this.markNotes(index),
    });

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
    this.notesListEl = this.notesEl.createEl('ul', { cls: 'concept-atlas-notes' });

    const footer = this.root.createEl('details', { cls: 'concept-atlas-footer' });
    footer.createEl('summary', { text: 'What the lattice shows' });
    footer.createEl('p', { text: EXPLANATION });

    this.registerDomEvent(this.searchInput, 'input', () => this.update(setSearch(this.state, this.searchInput.value)));
    this.registerDomEvent(clear, 'click', () => this.update(clearFilters(this.state)));
    this.registerDomEvent(this.groupsEl, 'change', (ev) => {
      const target = ev.target;
      if (target instanceof HTMLInputElement && target.dataset.attribute) this.update(toggleValue(this.state, target.dataset.attribute));
    });
    this.registerDomEvent(zoomIn, 'click', () => this.diagram.zoomBy(1.25));
    this.registerDomEvent(zoomOut, 'click', () => this.diagram.zoomBy(0.8));
    this.registerDomEvent(fit, 'click', () => this.diagram.fit());
    this.registerDomEvent(this.notesEl, 'click', (ev) => this.onNotesClick(ev));

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? this.root.clientWidth;
      this.root.toggleClass('is-narrow', width > 0 && width < NARROW_WIDTH);
    });
    observer.observe(this.root);
    this.register(() => observer.disconnect());
    // Fits the diagram when the viewport gets a new size: a resize of the window or the pane, or the narrow mode. A change of the filter, the focus, the hover or the search does not change the size of the viewport: the notes column is always in the DOM and has a fixed width.
    const viewportObserver = new ResizeObserver(() => this.diagram.resized());
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
      const resolved = resolveFacets(config.facets, this.allProperties ?? []);
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
    this.model = null;
    let message = this.error === null ? null : errorText(this.error);
    if (message === null && this.loaded) {
      try {
        const model = buildModel(this.loaded.data, this.loaded.ctx, this.state, { maxNodes: this.loaded.maxNodes, part: previousPart });
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
    if (ok && partChanged) this.diagram.render(model, domFocus);
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
      fieldset.createEl('legend', { text: group.facet });
      for (const value of group.values) {
        const label = fieldset.createEl('label', { cls: 'concept-atlas-value' });
        label.toggleClass('is-disabled', value.disabled);
        label.toggleClass('is-shared', value.shared);
        const box = label.createEl('input', { type: 'checkbox', attr: { 'data-attribute': value.id } });
        box.checked = value.selected;
        box.disabled = value.disabled;
        label.createSpan({ cls: 'concept-atlas-value-label', text: value.label });
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
      this.notesFocusEl.createSpan({ text: focusCountText(notes.focus.support) });
      if (notes.focus.canFilterTo) this.notesFocusEl.createEl('button', { cls: 'concept-atlas-filter-to', text: 'Filter to this concept', attr: { 'data-action': 'filter-to' } });
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
