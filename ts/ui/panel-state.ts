// Panel states: a panel that is empty, loading or failed keeps its header and frame.
// This module touches no DOM at import time; only setPanelState needs a document.
import { escapeHtml } from './markup.ts';

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
  | { kind: 'empty'; title?: string; text: string; action?: { label: string; keys?: string; run: () => void } }
  | { kind: 'error'; text: string; retry: { label: string; run: () => void }; errorWord?: string };

/** A state as `panelStateHtml` writes it: the action and the Retry are trusted button markup the app wires itself. */
export type PanelStateMarkup =
  | { kind: 'loading'; rows: number }
  | { kind: 'empty'; title?: string; text: string; actionHtml?: string }
  | { kind: 'error'; text: string; retryHtml: string; errorWord?: string };

const LAYER = 'data-im-state-layer';
const HIDDEN_BY_STATE = 'data-im-state-hidden';

// Two lines per row, like the real rows they stand in for; the widths vary so the bars read as text.
const BAR_WIDTHS: ReadonlyArray<readonly [number, number]> = [
  [62, 40],
  [48, 55],
  [70, 34],
];

// The inline sizes of a skeleton row, as the style attribute both renderers write: a browser keeps an attribute as it is
// given, so the layer setPanelState builds and the one panelStateHtml writes are the same markup.
const AVATAR_STYLE = 'width: 26px; height: 26px; flex: none;';
const LINES_STYLE = 'gap: var(--im-s-2);';
const barStyle = (width: number, sub: boolean): string => `width: ${width}%;${sub ? ' height: 8px;' : ''}`;
const rowCount = (rows: number): number => (Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0);
const barWidths = (index: number): readonly [number, number] => BAR_WIDTHS[index % BAR_WIDTHS.length];

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

function styled<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, style: string): HTMLElementTagNameMap[K] {
  const node = make(doc, tag, className);
  node.setAttribute('style', style);
  return node;
}

function skeletonRows(doc: Document, rows: number): HTMLElement {
  const layer = make(doc, 'div');
  layer.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < rowCount(rows); index++) {
    const [first, second] = barWidths(index);
    const row = make(doc, 'div', 'im-row');
    const lines = styled(doc, 'span', 'im-row-text', LINES_STYLE);
    lines.append(styled(doc, 'span', 'im-skeleton', barStyle(first, false)), styled(doc, 'span', 'im-skeleton', barStyle(second, true)));
    row.append(styled(doc, 'span', 'im-skeleton', AVATAR_STYLE), lines);
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
      if (state.title) layer.append(make(doc, 'strong', undefined, state.title));
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

/**
 * The layer `setPanelState` builds, as a string, for an app that paints a panel body from strings: a panel whose body
 * is this string is the panel `setPanelState` fills, less the listeners, which the app wires on its own buttons
 * (`actionHtml`, `retryHtml`, trusted markup). The string is the whole body while the panel is in that state, and the app
 * sets `aria-busy="true"` on a loading panel itself. `setPanelState` finds a layer written this way, and replaces or
 * removes it as its own. Text is escaped.
 */
export function panelStateHtml(state: PanelStateMarkup): string {
  switch (state.kind) {
    case 'loading': {
      let rows = '';
      for (let index = 0; index < rowCount(state.rows); index++) {
        const [first, second] = barWidths(index);
        rows += `<div class="im-row"><span class="im-skeleton" style="${AVATAR_STYLE}"></span><span class="im-row-text" style="${LINES_STYLE}">`
          + `<span class="im-skeleton" style="${barStyle(first, false)}"></span><span class="im-skeleton" style="${barStyle(second, true)}"></span></span></div>`;
      }
      return `<div aria-hidden="true" ${LAYER}="loading">${rows}</div>`;
    }
    case 'empty':
      return `<div class="im-empty" ${LAYER}="empty">${state.title ? `<strong>${escapeHtml(state.title)}</strong>` : ''}<span>${escapeHtml(state.text)}</span>${state.actionHtml ?? ''}</div>`;
    case 'error':
      return `<div class="im-failure" role="alert" ${LAYER}="error"><b>${escapeHtml(state.errorWord || 'Error')}</b><span>${escapeHtml(state.text)}</span>${state.retryHtml}</div>`;
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

// The bodies whose `role="listbox"` was set aside while a layer shows: a listbox may hold only options, and the layer is a
// message with a button. The body is a `group` meanwhile, and `ready` gives the listbox back.
const setAsideListbox = new WeakSet<HTMLElement>();

/**
 * Puts a panel into a state. It owns one element, the state layer, the first child of
 * `.im-panel-body`; the header, tools and footer are never touched. While a layer shows, the other
 * children of the body (the real content) are taken out of the layout, and `ready` puts them back. Focus that
 * was inside the layer it replaces moves to the new layer's first button, or to the panel body.
 *
 * In the sidebar region the body is the listbox of rows (`role="listbox"`), so the layer would be a child of a listbox
 * that is not an option: while a layer shows, the body is a `group`, and `ready` gives it its `listbox` back. A layer an app
 * wrote from a string (`panelStateHtml`) is the app's own body, and its role is the app's to set.
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
    if (setAsideListbox.delete(body)) body.setAttribute('role', 'listbox');
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
  if (body.getAttribute('role') === 'listbox') {
    setAsideListbox.add(body);
    body.setAttribute('role', 'group');
  }
  const layer = buildLayer(panel.ownerDocument, state);
  layer.setAttribute(LAYER, state.kind);
  body.prepend(layer);

  if (state.kind === 'loading') panel.setAttribute('aria-busy', 'true');
  else panel.removeAttribute('aria-busy');

  if (holdsFocus) keepFocus(body, layer);
}
