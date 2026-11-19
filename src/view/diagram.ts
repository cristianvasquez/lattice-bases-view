// SVG diagram of the displayed part of the lattice, with pan and zoom. DOM code; the layout comes from layout.ts.
import type { Component } from 'obsidian';
import { DEFAULT_LAYOUT, DIAGRAM_PAD, fitTransform } from './layout';
import { type DisplayModel, type DisplayNode, nodesAbove } from './model';
import type { Cover } from '../fca';

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;
/** Size of a compact node: a node that adds no value to the nodes above it. */
const COMPACT_WIDTH = 56;
const COMPACT_HEIGHT = 28;
/** Height of a node with one line of text. A node with a second line (zero support) uses `DEFAULT_LAYOUT.nodeHeight`. */
const SINGLE_HEIGHT = 32;

function nodeHeight(node: DisplayNode | undefined): number {
  if (!node) return DEFAULT_LAYOUT.nodeHeight;
  if (node.compact) return COMPACT_HEIGHT;
  return node.sublabel === '' ? SINGLE_HEIGHT : DEFAULT_LAYOUT.nodeHeight;
}

export interface DiagramHandlers {
  /** Click, Enter or Space on a node. */
  activate(index: number): void;
  /** Double-click or Shift+Enter on a node: filter to the concept, or back to the previous filter on the start node. */
  toggleFilter(index: number): void;
  /** Arrow keys and Escape on a node. */
  key(index: number, key: 'up' | 'down' | 'left' | 'right' | 'escape'): void;
  /** Click on the diagram background (not after a drag). */
  background(): void;
  /** The marked node changed: the node under the pointer, else the node with the keyboard focus, else the focused concept, else null. */
  marked(index: number | null): void;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Counter for element ids that are unique per diagram instance. */
let diagramCount = 0;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, parent: Element, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (cls) el.setAttribute('class', cls);
  parent.appendChild(el);
  return el;
}

export class Diagram {
  readonly viewport: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly group: SVGGElement;
  private transform: Transform = { x: 0, y: 0, k: 1 };
  private size = { width: 0, height: 0 };
  /** Top center of the start node (index 0) in graph coordinates. */
  private start = { x: 0, y: 0 };
  /** The layout key of the last render. A new key fits the diagram. */
  private layoutKey = '';
  /** True after the user pans or zooms; a resize then keeps the transform. */
  private moved = false;
  private drag: { id: number; x: number; y: number; tx: number; ty: number; active: boolean } | null = null;
  private suppressClick = false;
  /** Node and edge elements of the last render. `edgeEls[i]` draws `covers[i]`. */
  private nodeEls: SVGGElement[] = [];
  private edgeEls: SVGLineElement[] = [];
  private covers: readonly Cover[] = [];
  /** The node under the pointer, the node with the keyboard focus and the focused concept (click or Enter). */
  private hovered: number | null = null;
  private keyboard: number | null = null;
  private selected: number | null = null;
  /** Prefix of the element ids of this diagram. */
  private readonly idPrefix = `concept-atlas-diagram-${++diagramCount}`;

  /** `labelId` is the id of the element that gives the accessible name of the diagram. It is not an SVG `title`, because Chromium shows a `title` of the root SVG as a tooltip on the full diagram. */
  constructor(parent: HTMLElement, component: Component, labelId: string, private readonly handlers: DiagramHandlers) {
    this.viewport = parent.createDiv({ cls: 'concept-atlas-viewport' });
    this.svg = svgEl('svg', this.viewport, { role: 'group', 'aria-labelledby': labelId }, 'concept-atlas-svg');
    this.group = svgEl('g', this.svg, {});

    component.registerDomEvent(this.viewport, 'pointerdown', (ev) => this.onPointerDown(ev));
    component.registerDomEvent(this.viewport, 'pointermove', (ev) => this.onPointerMove(ev));
    component.registerDomEvent(this.viewport, 'pointerup', (ev) => this.onPointerUp(ev));
    component.registerDomEvent(this.viewport, 'pointercancel', (ev) => this.onPointerUp(ev));
    component.registerDomEvent(this.viewport, 'wheel', (ev) => this.onWheel(ev), { passive: false });
    component.registerDomEvent(this.viewport, 'click', (ev) => this.onClick(ev));
    component.registerDomEvent(this.viewport, 'dblclick', (ev) => this.onDoubleClick(ev));
    component.registerDomEvent(this.viewport, 'keydown', (ev) => this.onKeyDown(ev));
    component.registerDomEvent(this.viewport, 'pointerover', (ev) => this.setHovered(this.nodeIndex(ev.target)));
    component.registerDomEvent(this.viewport, 'pointerleave', () => this.setHovered(null));
    component.registerDomEvent(this.viewport, 'focusin', (ev) => {
      this.keyboard = this.nodeIndex(ev.target);
      this.highlight();
    });
    component.registerDomEvent(this.viewport, 'focusout', (ev) => {
      if (this.nodeIndex(ev.relatedTarget) === null) {
        this.keyboard = null;
        this.highlight();
      }
    });
  }

  /** Draws the model. `domFocus` is the node that gets the keyboard focus after the render, or null. */
  render(model: DisplayModel, domFocus: number | null): void {
    const { layout, nodes, covers } = model;
    this.size = { width: layout.width, height: layout.height };
    this.start = nodes.length > 0 ? { x: layout.x[0]!, y: layout.y[0]! - nodeHeight(nodes[0]) / 2 } : { x: layout.width / 2, y: 0 };
    this.group.replaceChildren();
    const w = layout.nodeWidth;
    const half = (node: DisplayNode | undefined) => nodeHeight(node) / 2;

    const edges = svgEl('g', this.group, {}, 'concept-atlas-edges');
    this.covers = covers;
    this.edgeEls = covers.map(([u, l]) =>
      svgEl('line', edges, { x1: layout.x[u]!, y1: layout.y[u]! + half(nodes[u]), x2: layout.x[l]!, y2: layout.y[l]! - half(nodes[l]) }, 'concept-atlas-edge'),
    );
    this.nodeEls = [];

    let focusEl: SVGGElement | null = null;
    for (const node of nodes) {
      const classes = ['concept-atlas-node'];
      if (node.zero) classes.push('is-zero');
      if (node.isStart) classes.push('is-start');
      if (node.compact) classes.push('is-compact');
      if (model.focusIndex === node.index) classes.push('is-focused');
      const nodeTitleId = `${this.idPrefix}-node-${node.index}-title`;
      // A compact node keeps its own small width; its center is on the column grid of the layout.
      const nw = node.compact ? Math.min(COMPACT_WIDTH, w) : w;
      const nh = nodeHeight(node);
      const g = svgEl(
        'g',
        this.group,
        {
          transform: `translate(${layout.x[node.index]! - nw / 2},${layout.y[node.index]! - nh / 2})`,
          tabindex: 0,
          role: 'button',
          'aria-labelledby': nodeTitleId,
          'aria-pressed': model.focusIndex === node.index ? 'true' : 'false',
          'data-index': node.index,
        },
        classes.join(' '),
      );
      svgEl('title', g, { id: nodeTitleId }).textContent = node.ariaLabel;
      svgEl('rect', g, { width: nw, height: nh, rx: 6, ry: 6 }, 'concept-atlas-node-box');
      const single = node.sublabel === '';
      svgEl('text', g, { x: nw / 2, y: single ? nh / 2 + 4 : 19, 'text-anchor': 'middle' }, node.compact ? 'concept-atlas-node-support' : 'concept-atlas-node-label').textContent = node.label;
      if (!single) svgEl('text', g, { x: nw / 2, y: 37, 'text-anchor': 'middle' }, 'concept-atlas-node-support').textContent = node.sublabel;
      if (domFocus === node.index) focusEl = g;
      this.nodeEls[node.index] = g;
    }

    // A new render replaces the elements: the old hover and keyboard indexes are not valid.
    this.hovered = null;
    this.keyboard = null;
    this.selected = model.focusIndex;
    this.highlight();

    const key = `${layout.width}x${layout.height}:${nodes.map((n) => n.intent.join(',')).join('|')}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.fit();
    } else {
      this.apply();
    }
    (focusEl as SVGGElement | null)?.focus({ preventScroll: true });
  }

  /** Marks the focused node without a new render. `domFocus` is the node that gets the keyboard focus, or null. */
  setFocus(focusIndex: number | null, domFocus: number | null): void {
    for (const el of Array.from(this.group.querySelectorAll<SVGGElement>('[data-index]'))) {
      const index = Number(el.getAttribute('data-index'));
      el.classList.toggle('is-focused', index === focusIndex);
      el.setAttribute('aria-pressed', index === focusIndex ? 'true' : 'false');
      if (index === domFocus) el.focus({ preventScroll: true });
    }
    this.selected = focusIndex;
    this.highlight();
  }

  private setHovered(index: number | null): void {
    if (index === this.hovered) return;
    this.hovered = index;
    this.highlight();
  }

  /** Marks the node under the pointer, else the node with the keyboard focus, else the focused concept, with all displayed nodes above it and the edges between them. */
  private highlight(): void {
    const target = this.hovered ?? this.keyboard ?? this.selected;
    const valid = target !== null && target >= 0 && target < this.nodeEls.length;
    this.group.classList.toggle('has-highlight', valid);
    const above = valid ? nodesAbove(this.covers, target) : { nodes: [], edges: [] };
    const nodes = new Set(above.nodes);
    const edges = new Set(above.edges);
    this.nodeEls.forEach((el, i) => el.classList.toggle('is-marked', nodes.has(i)));
    this.edgeEls.forEach((el, i) => el.classList.toggle('is-marked', edges.has(this.covers[i]!)));
    this.handlers.marked(valid ? target : null);
  }

  /** Fits the width of the diagram to the viewport at a scale from 0.7 to 1, with the top of the diagram at the top of the viewport. See `fitTransform`. */
  fit(): void {
    this.moved = false;
    this.transform = fitTransform(this.size, this.start, { width: this.viewport.clientWidth, height: this.viewport.clientHeight }, DIAGRAM_PAD);
    this.apply();
  }

  /** Called when the viewport size changes. Fits again unless the user moved the diagram. */
  resized(): void {
    if (!this.moved) this.fit();
  }

  /** Zooms by `factor` around a point of the viewport (default: the center). */
  zoomBy(factor: number, cx = this.viewport.clientWidth / 2, cy = this.viewport.clientHeight / 2): void {
    const { x, y, k } = this.transform;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, k * factor));
    const r = next / k;
    this.transform = { x: cx - (cx - x) * r, y: cy - (cy - y) * r, k: next };
    this.moved = true;
    this.apply();
  }

  private apply(): void {
    const { x, y, k } = this.transform;
    this.group.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
  }

  private nodeIndex(target: EventTarget | null): number | null {
    if (!(target instanceof Element)) return null;
    const node = target.closest('[data-index]');
    if (!node) return null;
    const index = Number(node.getAttribute('data-index'));
    return Number.isInteger(index) ? index : null;
  }

  private onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.suppressClick = false;
    this.drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, tx: this.transform.x, ty: this.transform.y, active: false };
  }

  private onPointerMove(ev: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== ev.pointerId) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.active) {
      drag.active = true;
      this.viewport.setPointerCapture(ev.pointerId);
      this.viewport.addClass('is-dragging');
    }
    this.transform = { ...this.transform, x: drag.tx + dx, y: drag.ty + dy };
    this.moved = true;
    this.apply();
  }

  private onPointerUp(ev: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== ev.pointerId) return;
    if (drag.active) {
      this.suppressClick = true;
      if (this.viewport.hasPointerCapture(ev.pointerId)) this.viewport.releasePointerCapture(ev.pointerId);
      this.viewport.removeClass('is-dragging');
    }
    this.drag = null;
  }

  /** The wheel with no modifier key scrolls the diagram (vertical, and horizontal with Shift or a trackpad). Ctrl+wheel (and a pinch, which Chromium sends as Ctrl+wheel) zooms. */
  private onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    // deltaMode 1 is lines, 2 is pages.
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? this.viewport.clientHeight : 1;
    if (ev.ctrlKey || ev.metaKey) {
      const rect = this.viewport.getBoundingClientRect();
      this.zoomBy(Math.exp(-ev.deltaY * unit * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top);
      return;
    }
    const dx = ev.shiftKey && ev.deltaX === 0 ? ev.deltaY : ev.deltaX;
    const dy = ev.shiftKey && ev.deltaX === 0 ? 0 : ev.deltaY;
    this.transform = { ...this.transform, x: this.transform.x - dx * unit, y: this.transform.y - dy * unit };
    this.moved = true;
    this.apply();
  }

  private onClick(ev: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const index = this.nodeIndex(ev.target);
    if (index !== null) this.handlers.activate(index);
    else this.handlers.background();
  }

  /** The two clicks before the double-click focus the node; the double-click then replaces the filter and removes that focus. */
  private onDoubleClick(ev: MouseEvent): void {
    const index = this.nodeIndex(ev.target);
    if (index === null) return;
    ev.preventDefault();
    this.handlers.toggleFilter(index);
  }

  private onKeyDown(ev: KeyboardEvent): void {
    const index = this.nodeIndex(ev.target);
    if (index === null) return;
    const keys: Record<string, 'up' | 'down' | 'left' | 'right' | 'escape'> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Escape: 'escape',
    };
    // Escape removes the focused concept. The node keeps the keyboard focus, but it is not marked until the focus moves.
    if (ev.key === 'Escape') this.keyboard = null;
    if (ev.key === 'Enter' && ev.shiftKey) {
      ev.preventDefault();
      this.handlers.toggleFilter(index);
      return;
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this.handlers.activate(index);
      return;
    }
    const key = keys[ev.key];
    if (!key) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.handlers.key(index, key);
  }
}
