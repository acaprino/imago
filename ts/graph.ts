import { select } from 'd3-selection';
import { zoom, zoomIdentity, zoomTransform } from 'd3-zoom';

export interface GraphPoint { x: number; y: number }
export interface GraphBox extends GraphPoint { width: number; height: number }
export interface GraphNode extends GraphBox {
  id: string;
  label: string;
  /** Accessible name and tooltip when the visible label is deliberately compact. */
  ariaLabel?: string;
  title?: string;
  detail?: string;
  count?: number;
  content?: Node;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  external?: boolean;
  openLabel?: string;
}
export interface GraphGroup extends GraphBox { id: string; content: Node }
export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  showLabel?: boolean;
  points?: readonly GraphPoint[] | null;
  dashed?: boolean;
  dotted?: boolean;
  /** False for a symmetric relationship such as mutual exclusion. */
  directed?: boolean;
  tone?: 'accent' | 'warn' | 'err';
  dimmed?: boolean;
}
export interface GraphScene { nodes: readonly GraphNode[]; edges: readonly GraphEdge[]; groups?: readonly GraphGroup[] }
export interface GraphCamera { x: number; y: number; k: number }
/** Camera plus whether resizing or changing the scene should fit it automatically. */
export interface GraphViewport extends GraphCamera { fitted: boolean }
export interface GraphOptions {
  label: string;
  /** Stable identity across remounts; defaults to the accessible region label. */
  key?: string;
  controls: { zoomIn: string; zoomOut: string; fit: string };
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  onClear?: () => void;
}

// A layout engine can supply the route. Unrouted edges attach to the nearest facing sides.
function route(a: GraphBox, b: GraphBox, edge: GraphEdge): readonly GraphPoint[] {
  if (edge.points && edge.points.length > 1) return edge.points;
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  if (a === b) {
    const right = a.x + a.width;
    return [{ x: right, y: ay }, { x: right + 16, y: ay }, { x: right + 16, y: a.y - 16 }, { x: ax, y: a.y - 16 }, { x: ax, y: a.y }];
  }
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
    const side = bx >= ax ? 1 : -1, x = ax + side * a.width / 2, end = bx - side * b.width / 2;
    return [{ x, y: ay }, { x: (x + end) / 2, y: ay }, { x: (x + end) / 2, y: by }, { x: end, y: by }];
  }
  const side = by >= ay ? 1 : -1, y = ay + side * a.height / 2, end = by - side * b.height / 2;
  return [{ x: ax, y }, { x: ax, y: (y + end) / 2 }, { x: bx, y: (y + end) / 2 }, { x: bx, y: end }];
}

let serial = 0;
/** Mount one read-only diagram. The app owns its layout, identifiers and selected state. */
export function graphView(host: HTMLElement, options: GraphOptions) {
  const doc = host.ownerDocument;
  const html = <K extends keyof HTMLElementTagNameMap>(tag: K, name: string) => {
    const el = doc.createElement(tag);
    el.className = name;
    return el;
  };
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K) => doc.createElementNS('http://www.w3.org/2000/svg', tag);
  const root = html('div', 'im-graph');
  const pane = html('div', 'im-graph-pane');
  const focusKey = (part: string, id = '') => JSON.stringify(['graph', options.key ?? options.label, part, id]);
  pane.dataset.imKey = focusKey('viewport');
  pane.tabIndex = 0;
  pane.setAttribute('role', 'region');
  pane.setAttribute('aria-label', options.label);
  const world = html('div', 'im-graph-world');
  const lines = svg('svg');
  lines.setAttribute('aria-hidden', 'true');
  const defs = svg('defs'), marker = svg('marker'), arrow = svg('path');
  marker.id = 'im-graph-arrow-' + ++serial;
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '7'); marker.setAttribute('markerHeight', '7');
  marker.setAttribute('orient', 'auto');
  arrow.setAttribute('d', 'M0 0L10 5L0 10Z');
  arrow.setAttribute('fill', 'context-stroke');
  marker.append(arrow); defs.append(marker);
  const paths = svg('g');
  lines.append(defs, paths);
  const groups = html('div', 'im-graph-groups'), cards = html('div', 'im-graph-cards');
  world.append(groups, lines, cards); pane.append(world);
  const controls = html('div', 'im-graph-tools');
  root.append(pane, controls); host.append(root);

  const selection = select(pane);
  const behavior = zoom<HTMLDivElement, unknown>().scaleExtent([0.01, 4])
    .filter(event => (!event.ctrlKey || event.type === 'wheel') && !event.button &&
      (event.type === 'wheel' || !(event.target as Element).closest('button')))
    .on('zoom', event => {
      const { x, y, k } = event.transform;
      world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    });
  selection.call(behavior).on('dblclick.zoom', null);
  let bounds: GraphBox | null = null;
  const entries = new Map<string, HTMLButtonElement>();
  let activeNode: string | undefined;
  function setTabStop(id: string | undefined, index: number) {
    const button = id === undefined ? null : entries.get(id);
    if (!button) return;
    button.tabIndex = index;
    if (button.nextElementSibling instanceof HTMLButtonElement) button.nextElementSibling.tabIndex = index;
  }
  let edges: readonly GraphEdge[] = [];
  let fitted = true;
  behavior.on('start', event => { if (event.sourceEvent) fitted = false; });

  function camera(): GraphCamera {
    const { x, y, k } = zoomTransform(pane);
    return { x, y, k };
  }
  function restore({ x, y, k }: GraphCamera) {
    fitted = false;
    selection.call(behavior.transform, zoomIdentity.translate(x, y).scale(k));
  }
  function viewport(): GraphViewport { return { ...camera(), fitted }; }
  function restoreViewport(snapshot: GraphViewport) {
    restore(snapshot);
    if (snapshot.fitted) fit();
  }
  function fit() {
    // Keep the intention even while hidden or before the first scene is drawn.
    fitted = true;
    if (!bounds || !pane.clientWidth || !pane.clientHeight) return;
    const k = Math.min(1.1, Math.max(.01, Math.min(pane.clientWidth / (bounds.width + 48), pane.clientHeight / (bounds.height + 48))));
    restore({ x: (pane.clientWidth - bounds.width * k) / 2 - bounds.x * k,
      y: (pane.clientHeight - bounds.height * k) / 2 - bounds.y * k, k });
    fitted = true;
  }
  function scale(by: number) { fitted = false; selection.call(behavior.scaleBy, by); }
  function tool(text: string, label: string, action: () => void) {
    const b = html('button', 'im-btn im-btn--sm');
    b.type = 'button'; b.textContent = text; b.title = label; b.setAttribute('aria-label', label);
    b.dataset.imKey = focusKey('tool', label);
    b.addEventListener('click', action); controls.append(b);
  }
  tool('−', options.controls.zoomOut, () => scale(.8));
  tool('+', options.controls.zoomIn, () => scale(1.25));
  tool(options.controls.fit, options.controls.fit, fit);
  const observer = new ResizeObserver(() => { if (fitted) fit(); });
  observer.observe(pane);
  pane.addEventListener('click', event => {
    // A synchronous selection update may replace the label that received this click.
    const onContent = event.composedPath().some(el => el instanceof Element && el.matches('button, .im-graph-group'));
    if (!onContent && !event.defaultPrevented) options.onClear?.();
  });
  pane.addEventListener('focusin', event => {
    const target = event.target as HTMLElement;
    if (!target.closest('.im-graph-world')) return;
    const id = target.closest<HTMLElement>('[data-im-node]')?.dataset.imNode;
    if (id !== undefined && id !== activeNode) {
      setTabStop(activeNode, -1); activeNode = id; setTabStop(id, 0);
    }
    const box = target.getBoundingClientRect(), frame = pane.getBoundingClientRect();
    if (box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom) return;
    const c = camera();
    restore({ ...c, x: c.x + (frame.left + frame.right - box.left - box.right) / 2,
      y: c.y + (frame.top + frame.bottom - box.top - box.bottom) / 2 });
  });
  pane.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = (event.target as HTMLElement).closest<HTMLElement>('[data-im-node]')?.dataset.imNode;
    const ids = [...entries.keys()];
    let next: string | undefined;
    switch (event.key) {
      case '+': case '=': scale(1.25); break;
      case '-': scale(.8); break;
      case '0': fit(); break;
      case 'Home': next = ids[0]; break;
      case 'End': next = ids.at(-1); break;
      case 'ArrowDown': next = ids[Math.min(ids.length - 1, ids.indexOf(current ?? '') + 1)]; break;
      case 'ArrowUp': next = ids[Math.max(0, ids.indexOf(current ?? '') - 1)]; break;
      case 'ArrowRight': {
        const edge = edges.find(e => e.source === current && entries.has(e.target) || e.directed === false && e.target === current && entries.has(e.source));
        next = edge && (edge.source === current ? edge.target : edge.source); break;
      }
      case 'ArrowLeft': {
        const edge = edges.find(e => e.target === current && entries.has(e.source) || e.directed === false && e.source === current && entries.has(e.target));
        next = edge && (edge.target === current ? edge.source : edge.target); break;
      }
      default: return;
    }
    event.preventDefault();
    if (next !== undefined) entries.get(next)?.focus({ preventScroll: true });
  });

  function position(el: HTMLElement, box: GraphBox) {
    Object.assign(el.style, { left: box.x + 'px', top: box.y + 'px', width: box.width + 'px', height: box.height + 'px' });
  }
  function draw(scene: GraphScene, refit = false) {
    const active = doc.activeElement as HTMLElement | null;
    const activeId = active && cards.contains(active) ? active.closest<HTMLElement>('[data-im-node]')?.dataset.imNode : undefined;
    const activeOpen = active?.classList.contains('im-graph-open');
    const previous = new Map(entries);
    entries.clear(); edges = scene.edges;
    const boxes = new Map<string, GraphBox>();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const include = (x: number, y: number) => { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); };
    for (const box of [...scene.groups ?? [], ...scene.nodes]) {
      boxes.set(box.id, box); include(box.x, box.y); include(box.x + box.width, box.y + box.height);
    }
    groups.replaceChildren(...(scene.groups ?? []).map(group => {
      const el = html('div', 'im-graph-group'); position(el, group); el.append(group.content); return el;
    }));
    const strokes = doc.createDocumentFragment();
    for (const edge of edges) {
      const a = boxes.get(edge.source), b = boxes.get(edge.target);
      if (!a || !b) continue;
      const points = route(a, b, edge);
      const g = svg('g'), path = svg('path');
      g.setAttribute('class', 'im-graph-edge');
      if (edge.tone) g.dataset.imTone = edge.tone;
      if (edge.dimmed) g.dataset.imDimmed = 'true';
      path.setAttribute('d', points.map((p, i) => { include(p.x, p.y); return (i ? 'L' : 'M') + p.x + ',' + p.y; }).join(' '));
      if (edge.directed !== false) path.setAttribute('marker-end', 'url(#' + marker.id + ')');
      if (edge.dotted) { path.setAttribute('stroke-dasharray', '1 4'); path.setAttribute('stroke-linecap', 'round'); }
      else if (edge.dashed) path.setAttribute('stroke-dasharray', '5 4');
      g.append(path);
      if (edge.label) {
        const title = svg('title'); title.textContent = edge.label; g.append(title);
        if (edge.showLabel) {
          let segment = 1, longest = -1;
          for (let i = 1; i < points.length; i++) {
            const length = Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
            if (length > longest) { longest = length; segment = i; }
          }
          const from = points[segment-1], to = points[segment], label = svg('text');
          label.setAttribute('x', String((from.x + to.x) / 2)); label.setAttribute('y', String((from.y + to.y) / 2));
          label.textContent = edge.label; g.append(label);
        }
      }
      strokes.append(g);
    }
    paths.replaceChildren(strokes);
    const items = doc.createDocumentFragment();
    for (const node of scene.nodes) {
      const card = html('div', 'im-graph-card'); position(card, node); card.dataset.imNode = node.id;
      if (node.dimmed) card.dataset.imDimmed = 'true';
      if (node.external) card.dataset.imExternal = 'true';
      if (node.highlighted) card.dataset.imTone = 'warn';
      const button = previous.get(node.id) ?? html('button', 'im-graph-node');
      button.tabIndex = -1;
      button.replaceChildren();
      button.type = 'button'; button.title = node.title ?? node.label;
      button.dataset.imKey = focusKey('select', node.id);
      if (node.ariaLabel) button.setAttribute('aria-label', node.ariaLabel);
      else button.removeAttribute('aria-label');
      button.setAttribute('aria-pressed', String(!!node.selected));
      if (node.content) button.append(node.content);
      else {
        const text = html('span', 'im-row-text'), title = html('span', 'im-row-title');
        title.textContent = node.label; text.append(title);
        if (node.detail) { const detail = html('span', 'im-row-sub'); detail.textContent = node.detail; text.append(detail); }
        button.append(text);
        if (node.count !== undefined) { const count = html('span', 'im-count'); count.textContent = String(node.count); button.append(count); }
      }
      button.onclick = () => options.onSelect?.(node.id);
      button.ondblclick = node.openLabel && options.onOpen ? () => options.onOpen?.(node.id) : null;
      entries.set(node.id, button); card.append(button);
      if (node.openLabel && options.onOpen) {
        const open = html('button', 'im-icon-btn im-graph-open');
        open.tabIndex = -1;
        open.dataset.imKey = focusKey('open', node.id);
        open.type = 'button'; open.textContent = '›'; open.title = node.openLabel; open.setAttribute('aria-label', node.openLabel);
        open.onclick = () => options.onOpen?.(node.id);
        card.append(open);
      }
      items.append(card);
    }
    cards.replaceChildren(items);
    if (activeNode === undefined || !entries.has(activeNode)) activeNode = scene.nodes.find(n => n.selected)?.id ?? scene.nodes[0]?.id;
    setTabStop(activeNode, 0);
    bounds = boxes.size ? { x: left, y: top, width: right-left, height: bottom-top } : null;
    if (refit || fitted) fit();
    if (activeId !== undefined) {
      const button = entries.get(activeId);
      ((activeOpen && button?.nextElementSibling instanceof HTMLElement ? button.nextElementSibling : button) ?? pane).focus({ preventScroll: true });
    }
  }
  return { draw, fit, camera, restore, viewport, restoreViewport, dispose() { observer.disconnect(); selection.on('.zoom', null); root.remove(); } };
}
export * from './graph-editor.ts';
