/** A scrollable editing surface. Consumers own node content, coordinates and mutations. */
type Point = { x: number; y: number };
const ns = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

const activates = (event: KeyboardEvent) => event.key === ' ' ||
  (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229);

export function graphEditorWorkspace(label: string, paletteLabel: string) {
  const root = document.createElement('section');
  root.className = 'im-editor-workspace';
  root.setAttribute('aria-label', label);
  const body = document.createElement('div');
  body.className = 'im-editor-body';
  const palette = document.createElement('aside');
  palette.className = 'im-editor-palette';
  palette.setAttribute('aria-label', paletteLabel);
  const stage = document.createElement('div');
  stage.className = 'im-editor-stage';
  const editor = graphEditor();
  stage.append(editor.scroll);
  body.append(palette, stage);
  root.append(body);
  return { root, body, palette, stage, editor };
}

export function graphEditor() {
  const scroll = document.createElement('div');
  const canvas = document.createElement('div');
  const nodes = document.createElement('div');
  scroll.className = 'im-editor-scroll';
  canvas.className = 'im-editor-canvas';
  const wires = svg('svg', { class: 'im-editor-wires' });
  const defs = svg('defs');
  const edges = svg('g');
  wires.append(defs, edges);
  canvas.append(wires, nodes);
  scroll.append(canvas);
  return { scroll, canvas, nodes, edges, defs, wires,
    point(event: PointerEvent): Point {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    },
  };
}

/**
 * A nonmodal inspector local to a graph. The editor controls its visibility and focus.
 * This surface can stay mounted in a parked graph without participating in native dialog state.
 */
export function graphInspector(label: string) {
  const inspector = document.createElement('section');
  inspector.className = 'im-editor-inspector';
  inspector.setAttribute('role', 'dialog');
  inspector.setAttribute('aria-label', label);
  return inspector;
}

export function graphEditorNode(actions: {
  press(event: PointerEvent): void;
  open(): void;
  nudge(delta: Point): void;
}) {
  const node = document.createElement('div');
  node.className = 'im-editor-node';
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.onpointerdown = actions.press;
  node.onkeydown = event => {
    if (event.target !== node) return;
    if (activates(event)) {
      event.preventDefault();
      actions.open();
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    const directions: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    };
    const delta = directions[event.key];
    if (delta) { event.preventDefault(); actions.nudge(delta); }
  };
  return node;
}

/** Pointer handle for a node that also exposes a keyboard connection command. */
export function graphEditorPort(symbol: string, title: string, press: (event: PointerEvent) => void) {
  const port = document.createElement('button');
  port.type = 'button';
  port.className = 'im-editor-port';
  port.tabIndex = -1;
  port.setAttribute('aria-hidden', 'true');
  port.title = title;
  port.textContent = symbol;
  port.onpointerdown = event => { event.stopPropagation(); press(event); };
  return port;
}

export function graphArrowMarker(defs: SVGDefsElement, id: string) {
  const marker = svg('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '11',
    markerHeight: '11', markerUnits: 'userSpaceOnUse', orient: 'auto' });
  const arrow = svg('path', { class: 'im-editor-arrow', d: 'M0 0L10 5L0 10z' });
  marker.append(arrow);
  defs.append(marker);
  return arrow;
}

export function graphEditorEdge(a: Point, b: Point, markerId: string, open: () => void) {
  const d = `M${a.x} ${a.y}L${b.x} ${b.y}`;
  const group = svg('g', { class: 'im-editor-edge', tabindex: '0', role: 'button' });
  const hit = svg('path', { class: 'im-editor-hit', d });
  const line = svg('path', { class: 'im-editor-line', d, 'marker-end': `url(#${markerId})` });
  const label = svg('text', { class: 'im-editor-label', x: String((a.x + b.x) / 2), y: String((a.y + b.y) / 2 - 6), 'text-anchor': 'middle' });
  const title = svg('title');
  group.append(title, hit, line, label);
  group.addEventListener('pointerdown', event => event.stopPropagation());
  group.addEventListener('click', open);
  group.addEventListener('keydown', event => {
    if (activates(event)) { event.preventDefault(); open(); }
  });
  return { group, line, label, title, hit };
}

/** Capture a single gesture, including drags that leave the graph viewport. */
export function graphGesture(event: PointerEvent, handlers: {
  move(event: PointerEvent): void;
  release(event: PointerEvent, moved: boolean): void;
  cancel(): void;
}) {
  const target = event.currentTarget as HTMLElement;
  const pointer = event.pointerId;
  const start = { x: event.clientX, y: event.clientY };
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let moved = false;
  function stop() {
    listeners.abort();
    if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
  }
  function cancel() { stop(); handlers.cancel(); }
  target.addEventListener('pointermove', next => {
    if (next.pointerId !== pointer) return;
    if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 4) return;
    moved = true; handlers.move(next);
  }, options);
  target.addEventListener('pointerup', next => {
    if (next.pointerId === pointer) { stop(); handlers.release(next, moved); }
  }, options);
  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
    target.addEventListener(type, next => { if (next.pointerId === pointer) cancel(); }, options);
  }
  target.ownerDocument.addEventListener('keydown', key => {
    if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); cancel(); }
  }, { ...options, capture: true });
  try { target.setPointerCapture(pointer); } catch { /* Synthetic gestures still dispatch on the target. */ }
  return stop;
}

export function graphConnectionPreview(layer: SVGElement, markerId: string) {
  const path = svg('path', { class: 'im-editor-preview', 'marker-end': `url(#${markerId})` });
  layer.append(path);
  return { path, update(from: Point, to: Point) { path.setAttribute('d', `M${from.x} ${from.y}L${to.x} ${to.y}`); } };
}

export function graphMiniature(options: { width: number; height: number; nodeWidth: number; nodeHeight: number;
  nodes: readonly Point[]; edges: readonly { a: Point; b: Point; kind?: string }[];
}) {
  const { width, height, nodeWidth, nodeHeight } = options;
  const drawing = svg('svg', { class: 'im-graph-mini', viewBox: `0 0 ${width} ${height}`, width: String(width), height: String(height), 'aria-hidden': 'true' });
  for (const { a, b, kind } of options.edges) {
    const line = svg('line', { class: 'im-graph-mini-edge', x1: String(a.x), y1: String(a.y), x2: String(b.x), y2: String(b.y) });
    if (kind) line.dataset.kind = kind;
    drawing.append(line);
  }
  for (const { x, y } of options.nodes) drawing.append(svg('rect', { class: 'im-graph-mini-node', x: String(x - nodeWidth / 2), y: String(y - nodeHeight / 2), width: String(nodeWidth), height: String(nodeHeight) }));
  return drawing;
}
