// Panel states: a panel that is empty, loading or failed keeps its header and frame.
// This module touches no DOM at import time; only setPanelState needs a document.

export const LOADING_DELAY_MS = 300;

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Runs `show` once after `delayMs`. Returns the function that cancels it: cancelled before the
 * delay, `show` never runs. Cancelling after `show` has run, or twice, does nothing.
 */
export function showAfter(delayMs: number, show: () => void, timers: Timers = realTimers): () => void {
  let waiting = true;
  const id = timers.set(() => {
    waiting = false;
    show();
  }, delayMs);
  return () => {
    if (!waiting) return;
    waiting = false;
    timers.clear(id);
  };
}

export type PanelState =
  | { kind: 'ready' }
  | { kind: 'loading'; rows: number }
  | { kind: 'empty'; text: string; action?: { label: string; keys?: string; run: () => void } }
  | { kind: 'error'; text: string; retry: { label: string; run: () => void }; errorWord?: string };

const LAYER = 'data-im-state-layer';
const HIDDEN_BY_STATE = 'data-im-state-hidden';

// Two lines per row, like the real rows they stand in for; the widths vary so the bars read as text.
const BAR_WIDTHS: ReadonlyArray<readonly [number, number]> = [
  [62, 40],
  [48, 55],
  [70, 34],
];

function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(doc: Document, label: string, keys: string | undefined, run: () => void): HTMLButtonElement {
  const button = make(doc, 'button', 'im-btn');
  button.type = 'button';
  button.append(make(doc, 'span', undefined, label));
  if (keys) button.append(make(doc, 'kbd', 'im-key', keys));
  button.addEventListener('click', () => run());
  return button;
}

function skeletonRows(doc: Document, rows: number): HTMLElement {
  const layer = make(doc, 'div');
  layer.setAttribute('aria-hidden', 'true');
  const count = Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0;
  for (let index = 0; index < count; index++) {
    const [first, second] = BAR_WIDTHS[index % BAR_WIDTHS.length];
    const row = make(doc, 'div', 'im-row');
    const avatar = make(doc, 'span', 'im-skeleton');
    avatar.style.width = '26px';
    avatar.style.height = '26px';
    avatar.style.flex = 'none';
    const lines = make(doc, 'span', 'im-row-text');
    lines.style.gap = 'var(--im-s-2)';
    const title = make(doc, 'span', 'im-skeleton');
    title.style.width = `${first}%`;
    const subtitle = make(doc, 'span', 'im-skeleton');
    subtitle.style.width = `${second}%`;
    subtitle.style.height = '8px';
    lines.append(title, subtitle);
    row.append(avatar, lines);
    layer.append(row);
  }
  return layer;
}

function buildLayer(doc: Document, state: Exclude<PanelState, { kind: 'ready' }>): HTMLElement {
  switch (state.kind) {
    case 'loading':
      return skeletonRows(doc, state.rows);
    case 'empty': {
      const layer = make(doc, 'div', 'im-empty');
      layer.append(make(doc, 'span', undefined, state.text));
      if (state.action) layer.append(actionButton(doc, state.action.label, state.action.keys, state.action.run));
      return layer;
    }
    case 'error': {
      const layer = make(doc, 'div', 'im-failure');
      layer.setAttribute('role', 'alert');
      layer.append(
        make(doc, 'b', undefined, state.errorWord || 'Error'),
        make(doc, 'span', undefined, state.text),
        actionButton(doc, state.retry.label, undefined, state.retry.run),
      );
      return layer;
    }
  }
}

// The layer that held focus (a pressed Retry, a pressed empty-state action) is gone, and focus on a removed element
// falls to <body>: keyboard use would start over from the top of the window. Focus goes to the new layer's first
// button, else to the panel body, which is focusable by script when the app has not made it focusable itself.
function keepFocus(body: HTMLElement, layer?: HTMLElement): void {
  const button = layer?.querySelector<HTMLElement>('button');
  if (button) {
    button.focus();
    return;
  }
  if (!body.hasAttribute('tabindex')) body.tabIndex = -1;
  body.focus();
}

/**
 * Puts a panel into a state. It owns one element, the state layer, the first child of
 * `.im-panel-body`; the header, tools and footer are never touched. While a layer shows, the other
 * children of the body (the real content) are taken out of the layout, and `ready` puts them back. Focus that
 * was inside the layer it replaces moves to the new layer's first button, or to the panel body.
 */
export function setPanelState(panel: HTMLElement, state: PanelState): void {
  const body = panel.querySelector<HTMLElement>(':scope > .im-panel-body');
  if (!body) throw new Error('setPanelState: the panel has no .im-panel-body');

  const previous = body.querySelector(`:scope > [${LAYER}]`);
  const holdsFocus = previous?.contains(panel.ownerDocument.activeElement) ?? false;
  previous?.remove();
  for (const content of body.querySelectorAll<HTMLElement>(`:scope > [${HIDDEN_BY_STATE}]`)) {
    content.style.display = content.getAttribute(HIDDEN_BY_STATE) ?? '';
    content.removeAttribute(HIDDEN_BY_STATE);
  }

  if (state.kind === 'ready') {
    panel.removeAttribute('aria-busy');
    if (holdsFocus) keepFocus(body);
    return;
  }

  // An inline display wins over the display a class gives a row; the `hidden` attribute would not.
  for (const content of body.children as HTMLCollectionOf<HTMLElement>) {
    if (getComputedStyle(content).display === 'none') continue;
    content.setAttribute(HIDDEN_BY_STATE, content.style.display);
    content.style.display = 'none';
  }
  const layer = buildLayer(panel.ownerDocument, state);
  layer.setAttribute(LAYER, state.kind);
  body.prepend(layer);

  if (state.kind === 'loading') panel.setAttribute('aria-busy', 'true');
  else panel.removeAttribute('aria-busy');

  if (holdsFocus) keepFocus(body, layer);
}
