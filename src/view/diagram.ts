// SVG diagram of the displayed part of the lattice, with pan and zoom. DOM code; the layout comes from layout.ts.
import type { Component } from 'obsidian';
import { DEFAULT_LAYOUT } from './layout';
import type { DisplayModel } from './model';

const PAD = 24;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;

export interface DiagramHandlers {
  /** Click, Enter or Space on a node. */
  activate(index: number): void;
  /** Arrow keys and Escape on a node. */
  key(index: number, key: 'up' | 'down' | 'left' | 'right' | 'escape'): void;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  /** The layout key of the last render. A new key fits the diagram. */
  private layoutKey = '';
  /** True after the user pans or zooms; a resize then keeps the transform. */
  private moved = false;
  private drag: { id: number; x: number; y: number; tx: number; ty: number; active: boolean } | null = null;
  private suppressClick = false;

  constructor(parent: HTMLElement, component: Component, private readonly handlers: DiagramHandlers) {
    this.viewport = parent.createDiv({ cls: 'concept-atlas-viewport' });
    this.svg = svgEl('svg', this.viewport, { role: 'group', 'aria-label': 'Concept diagram' }, 'concept-atlas-svg');
    this.group = svgEl('g', this.svg, {});

    component.registerDomEvent(this.viewport, 'pointerdown', (ev) => this.onPointerDown(ev));
    component.registerDomEvent(this.viewport, 'pointermove', (ev) => this.onPointerMove(ev));
    component.registerDomEvent(this.viewport, 'pointerup', (ev) => this.onPointerUp(ev));
    component.registerDomEvent(this.viewport, 'pointercancel', (ev) => this.onPointerUp(ev));
    component.registerDomEvent(this.viewport, 'wheel', (ev) => this.onWheel(ev), { passive: false });
    component.registerDomEvent(this.viewport, 'click', (ev) => this.onClick(ev));
    component.registerDomEvent(this.viewport, 'keydown', (ev) => this.onKeyDown(ev));
  }

  /** Draws the model. `domFocus` is the node that gets the keyboard focus after the render, or null. */
  render(model: DisplayModel, domFocus: number | null): void {
    const { layout, nodes, covers } = model;
    this.size = { width: layout.width, height: layout.height };
    this.group.replaceChildren();
    const w = DEFAULT_LAYOUT.nodeWidth;
    const h = DEFAULT_LAYOUT.nodeHeight;

    const edges = svgEl('g', this.group, {}, 'concept-atlas-edges');
    for (const [u, l] of covers) {
      svgEl('line', edges, { x1: layout.x[u]!, y1: layout.y[u]! + h / 2, x2: layout.x[l]!, y2: layout.y[l]! - h / 2 }, 'concept-atlas-edge');
    }

    let focusEl: SVGGElement | null = null;
    for (const node of nodes) {
      const classes = ['concept-atlas-node'];
      if (node.zero) classes.push('is-zero');
      if (node.isStart) classes.push('is-start');
      if (model.focusIndex === node.index) classes.push('is-focused');
      const g = svgEl(
        'g',
        this.group,
        {
          transform: `translate(${layout.x[node.index]! - w / 2},${layout.y[node.index]! - h / 2})`,
          tabindex: 0,
          role: 'button',
          'aria-label': node.ariaLabel,
          'aria-pressed': model.focusIndex === node.index ? 'true' : 'false',
          'data-index': node.index,
        },
        classes.join(' '),
      );
      svgEl('title', g, {}).textContent = node.ariaLabel;
      svgEl('rect', g, { width: w, height: h, rx: 6, ry: 6 }, 'concept-atlas-node-box');
      const single = node.sublabel === '';
      svgEl('text', g, { x: w / 2, y: single ? h / 2 + 4 : 19, 'text-anchor': 'middle' }, 'concept-atlas-node-label').textContent = node.label;
      if (!single) svgEl('text', g, { x: w / 2, y: 37, 'text-anchor': 'middle' }, 'concept-atlas-node-support').textContent = node.sublabel;
      if (domFocus === node.index) focusEl = g;
    }

    const key = `${layout.width}x${layout.height}:${nodes.map((n) => n.intent.join(',')).join('|')}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.fit();
    } else {
      this.apply();
    }
    (focusEl as SVGGElement | null)?.focus({ preventScroll: true });
  }

  /** Scales and centers the diagram to the viewport. */
  fit(): void {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    this.moved = false;
    if (vw === 0 || vh === 0 || this.size.width === 0) {
      this.transform = { x: PAD, y: PAD, k: 1 };
    } else {
      const k = Math.min(1, (vw - 2 * PAD) / this.size.width, (vh - 2 * PAD) / this.size.height);
      const scale = Math.max(MIN_SCALE, k);
      this.transform = { x: (vw - this.size.width * scale) / 2, y: Math.max(PAD, (vh - this.size.height * scale) / 2), k: scale };
    }
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

  private onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    this.zoomBy(Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top);
  }

  private onClick(ev: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const index = this.nodeIndex(ev.target);
    if (index !== null) this.handlers.activate(index);
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
