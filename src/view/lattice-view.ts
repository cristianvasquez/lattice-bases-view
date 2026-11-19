// The Bases view "Concept lattice". DOM code. The logic is in the pure modules state.ts, model.ts, layout.ts and text.ts.
import { BasesView, Keymap, type QueryController } from 'obsidian';
import { type AtlasData, buildAtlasData, resolveFacets } from '../bases';
import { type FormalContext, buildLattice } from '../fca';
import { VIEW_TYPE, readViewConfig } from './config';
import { Diagram } from './diagram';
import { type DisplayModel, type FacetValues, type NoteRef, buildModel, contextOf, neighbourFor } from './model';
import {
  type ViewState,
  clearFilters,
  filterToConcept,
  initialState,
  reconcileState,
  selectNote,
  setFocus,
  setSearch,
  toggleValue,
} from './state';
import {
  EXPLANATION,
  type FullLatticeState,
  errorText,
  fullLatticeText,
  noEntriesText,
  noSearchMatchText,
  noValuesText,
  notesText,
  shownText,
  valueText,
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
  private readonly messageEl: HTMLDivElement;
  private readonly diagram: Diagram;
  private readonly detailsEl: HTMLDivElement;

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
    this.statusEl = center.createDiv({ cls: 'concept-atlas-status', attr: { 'aria-live': 'polite' } });
    this.warningsEl = center.createDiv({ cls: 'concept-atlas-warnings' });
    this.toolbarEl = center.createDiv({ cls: 'concept-atlas-toolbar' });
    const zoomIn = this.toolbarEl.createEl('button', { text: '+', attr: { 'aria-label': 'Zoom in' } });
    const zoomOut = this.toolbarEl.createEl('button', { text: '−', attr: { 'aria-label': 'Zoom out' } });
    const fit = this.toolbarEl.createEl('button', { text: 'Fit', attr: { 'aria-label': 'Fit the diagram to the view' } });
    this.messageEl = center.createDiv({ cls: 'concept-atlas-message' });
    this.diagram = new Diagram(center, this, {
      activate: (index) => this.focusNode(index),
      key: (index, key) => this.onNodeKey(index, key),
    });

    const details = createRegion(main, 'concept-atlas-details', `${idPrefix}-details`, 'Details');
    this.detailsEl = details.createDiv({ cls: 'concept-atlas-details-body' });

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
    this.registerDomEvent(this.detailsEl, 'click', (ev) => this.onDetailsClick(ev));

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

  private onDetailsClick(ev: MouseEvent): void {
    const target = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-path], [data-inspect], [data-action]') : null;
    if (!target) return;
    if (target.dataset.path !== undefined) {
      ev.preventDefault();
      void this.app.workspace.openLinkText(target.dataset.path, '', Keymap.isModEvent(ev));
    } else if (target.dataset.inspect !== undefined) {
      this.update(selectNote(this.state, target.dataset.inspect));
    } else if (target.dataset.action === 'filter-to' && this.model?.details) {
      // The start node of the new diagram (index 0) gets the keyboard focus; the button becomes disabled.
      this.update(filterToConcept(this.state, this.model.details.intent), 0);
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
    // The filters and the diagram depend only on the part. A search, focus or inspector change keeps them and their DOM.
    const partChanged = model?.part == null || model.part !== previousPart;
    this.messageEl.toggleClass('is-hidden', message === null);
    this.messageEl.setText(message ?? '');
    this.toolbarEl.toggleClass('is-hidden', !ok);
    this.diagram.viewport.toggleClass('is-hidden', !ok);
    if (partChanged) keepFocus(this.groupsEl, ['data-attribute'], () => this.renderFilters());
    this.renderStatus();
    this.renderWarnings();
    if (ok && partChanged) this.diagram.render(model, domFocus);
    else if (ok) this.diagram.setFocus(model.focusIndex, domFocus);
    keepFocus(this.detailsEl, ['data-inspect', 'data-path', 'data-action'], () => this.renderDetails());
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

  private renderDetails(): void {
    this.detailsEl.empty();
    const model = this.model;
    if (!model || model.kind !== 'ok' || !model.details) return;
    const details = model.details;
    const section = this.detailsEl.createDiv({ cls: 'concept-atlas-concept' });
    section.createEl('h4', { text: details.isCurrent ? 'Current concept' : 'Focused concept' });
    section.createDiv({ cls: 'concept-atlas-support', text: notesText(details.support) });
    if (details.shared.length > 0) {
      section.createDiv({ cls: 'concept-atlas-subhead', text: 'Values that all these notes share' });
      this.renderFacetValues(section, details.shared);
    } else {
      section.createDiv({ cls: 'concept-atlas-muted', text: 'These notes share no recorded value.' });
    }
    const button = section.createEl('button', { cls: 'concept-atlas-filter-to', text: 'Filter to this concept', attr: { 'data-action': 'filter-to' } });
    button.disabled = details.filterEqualsIntent;

    section.createDiv({ cls: 'concept-atlas-subhead', text: 'Matching notes' });
    if (details.notes.length === 0) {
      const text = details.support === 0 ? 'No note has all of these values.' : noSearchMatchText(model.state.search.trim());
      section.createDiv({ cls: 'concept-atlas-muted', text });
    } else {
      const list = section.createEl('ul', { cls: 'concept-atlas-notes' });
      for (const note of details.notes) this.renderNote(list.createEl('li'), note);
    }

    const inspector = this.detailsEl.createDiv({ cls: 'concept-atlas-inspector' });
    inspector.createEl('h4', { text: 'Technique inspector' });
    const inspection = model.inspection;
    if (!inspection) {
      inspector.createDiv({ cls: 'concept-atlas-muted', text: "Select 'Inspect' next to a note to see its recorded values." });
      return;
    }
    const title = inspector.createDiv({ cls: 'concept-atlas-inspected' });
    title.createEl('a', { cls: 'internal-link', text: inspection.name, href: inspection.path, attr: { 'data-path': inspection.path } });
    inspector.createDiv({ cls: 'concept-atlas-subhead', text: 'Recorded values' });
    if (inspection.recorded.length > 0) this.renderFacetValues(inspector, inspection.recorded);
    else inspector.createDiv({ cls: 'concept-atlas-muted', text: 'No value is recorded for the configured facets.' });
    inspector.createDiv({ cls: 'concept-atlas-subhead', text: 'Not annotated' });
    if (inspection.notAnnotated.length > 0) {
      const list = inspector.createEl('ul', { cls: 'concept-atlas-not-annotated' });
      for (const facet of inspection.notAnnotated) list.createEl('li', { text: `${facet}: not annotated` });
    } else {
      inspector.createDiv({ cls: 'concept-atlas-muted', text: 'All configured facets are annotated.' });
    }
  }

  private renderFacetValues(parent: HTMLElement, groups: FacetValues[]): void {
    const list = parent.createEl('dl', { cls: 'concept-atlas-facets' });
    for (const group of groups) {
      list.createEl('dt', { text: group.facet });
      list.createEl('dd', { text: group.labels.join(', '), attr: { 'aria-label': group.labels.map((l) => valueText(group.facet, l)).join(', ') } });
    }
  }

  private renderNote(item: HTMLElement, note: NoteRef): void {
    item.addClass('concept-atlas-note');
    item.createEl('a', { cls: 'internal-link', text: note.name, href: note.path, attr: { 'data-path': note.path } });
    const inspect = item.createEl('button', { cls: 'concept-atlas-inspect', text: 'Inspect', attr: { 'data-inspect': note.path, 'aria-label': `Inspect ${note.name}` } });
    inspect.toggleClass('is-active', this.state.selectedNote === note.path);
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
