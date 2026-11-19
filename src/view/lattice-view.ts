// The Bases view "Concept lattice". DOM code. The logic is in the pure modules state.ts, model.ts, layout.ts and text.ts.
import { BasesView, Keymap, type QueryController } from 'obsidian';
import { type AtlasData, buildAtlasData, resolveFacets } from '../bases';
import { type FormalContext, buildLattice } from '../fca';
import { VIEW_TYPE, readViewConfig } from './config';
import { Diagram } from './diagram';
import { type DisplayModel, buildModel, contextOf, neighbourFor } from './model';
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
  NO_SHARED_TEXT,
  type FullLatticeState,
  errorText,
  fullLatticeText,
  noEntriesText,
  noSearchMatchText,
  noValuesText,
  notesText,
  selectionHeading,
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
  private readonly centerEl: HTMLDivElement;
  /** The selection panel below the diagram. It is in the DOM only when the model has a selection panel. */
  private readonly selectionEl: HTMLDivElement;
  private readonly selectionHeadingId: string;

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
    this.searchInput = filters.createEl('input', {
      cls: 'concept-atlas-search',
      type: 'search',
      placeholder: 'Search note names',
      attr: { 'aria-label': 'Search note names' },
    });
    const clear = filters.createEl('button', { cls: 'concept-atlas-clear', text: 'Clear filters' });
    this.groupsEl = filters.createDiv({ cls: 'concept-atlas-groups' });

    const center = createRegion(main, 'concept-atlas-center', `${idPrefix}-diagram`, 'Concept diagram');
    this.centerEl = center;
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
    });

    // Not attached here: render() adds the panel after the diagram when it has content.
    this.selectionHeadingId = `${idPrefix}-selection`;
    this.selectionEl = createDiv({ cls: 'concept-atlas-selection', attr: { role: 'region', 'aria-labelledby': this.selectionHeadingId } });

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
    this.registerDomEvent(this.selectionEl, 'click', (ev) => this.onSelectionClick(ev));

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? this.root.clientWidth;
      this.root.toggleClass('is-narrow', width > 0 && width < NARROW_WIDTH);
      this.diagram.resized();
    });
    observer.observe(this.root);
    this.register(() => observer.disconnect());
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

  private onSelectionClick(ev: MouseEvent): void {
    const target = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-path], [data-action]') : null;
    if (!target) return;
    if (target.dataset.path !== undefined) {
      ev.preventDefault();
      void this.app.workspace.openLinkText(target.dataset.path, '', Keymap.isModEvent(ev));
    } else if (target.dataset.action === 'filter-to' && this.model?.selection) {
      // The start node of the new diagram (index 0) gets the keyboard focus; the button is removed.
      this.update(filterToConcept(this.state, this.model.selection.intent), 0);
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
    if (ok && partChanged) this.diagram.render(model, domFocus);
    else if (ok) this.diagram.setFocus(model.focusIndex, domFocus);
    keepFocus(this.selectionEl, ['data-path', 'data-action'], () => this.renderSelection());
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

  private renderSelection(): void {
    this.selectionEl.empty();
    const model = this.model;
    const selection = model?.kind === 'ok' ? model.selection : null;
    if (!model || !selection) {
      this.selectionEl.remove();
      return;
    }
    if (this.selectionEl.parentElement !== this.centerEl) this.centerEl.appendChild(this.selectionEl);

    const head = this.selectionEl.createDiv({ cls: 'concept-atlas-selection-head' });
    head.createEl('h3', { text: selectionHeading(selection.kind), attr: { id: this.selectionHeadingId } });
    head.createSpan({ cls: 'concept-atlas-support', text: notesText(selection.support) });
    if (selection.canFilterTo) head.createEl('button', { cls: 'concept-atlas-filter-to', text: 'Filter to this concept', attr: { 'data-action': 'filter-to' } });

    if (selection.shared.length > 0) {
      const shared = this.selectionEl.createDiv({ cls: 'concept-atlas-shared' });
      for (const group of selection.shared) {
        const item = shared.createSpan({ cls: 'concept-atlas-shared-group' });
        item.createSpan({ cls: 'concept-atlas-shared-facet', text: `${group.facet}:` });
        for (const label of group.labels) item.createSpan({ cls: 'concept-atlas-shared-value', text: label });
      }
    } else {
      this.selectionEl.createDiv({ cls: 'concept-atlas-muted', text: NO_SHARED_TEXT });
    }

    if (selection.notes.length === 0) {
      const text = selection.support === 0 ? 'No note has all of these values.' : noSearchMatchText(model.state.search.trim());
      this.selectionEl.createDiv({ cls: 'concept-atlas-muted', text });
    } else {
      const list = this.selectionEl.createEl('ul', { cls: 'concept-atlas-notes' });
      for (const note of selection.notes) {
        list.createEl('li', { cls: 'concept-atlas-note' }).createEl('a', { cls: 'internal-link', text: note.name, href: note.path, attr: { 'data-path': note.path } });
      }
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
