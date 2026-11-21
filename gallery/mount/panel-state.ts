import { panelStateHtml, setPanelState, type PanelState, type PanelStateMarkup } from '../../ts/ui/panel-state.ts';
import type { MountContext } from '../main.ts';

type Panels = { empty: HTMLElement; loading: HTMLElement; error: HTMLElement };
declare global {
  interface Window {
    __imagoPanelState?: {
      setPanelState: typeof setPanelState;
      panelStateHtml: typeof panelStateHtml;
      panels: Panels;
      /** The same three panels, their bodies written from panelStateHtml as an app that repaints from strings does. */
      fromStrings: Panels;
    };
  }
}

const CONTAINER_ID = 'im-gallery-panel-states';

const SESSIONS: ReadonlyArray<readonly [string, string]> = [
  ['billing-service', 'Claude Code, 12 minutes ago'],
  ['docs-site', 'Codex, 1 hour ago'],
  ['mobile-app', 'OpenCode, yesterday'],
];

// The real rows the loading bars stand in for: the same two-line row, the same height.
function sessionRows(): HTMLElement[] {
  const make = (tag: string, className: string, text?: string): HTMLElement => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  return SESSIONS.map(([title, subtitle]) => {
    const row = make('div', 'im-row');
    const text = make('span', 'im-row-text');
    text.append(make('span', 'im-row-title', title), make('span', 'im-row-sub', subtitle));
    row.append(make('span', 'im-avatar', title.slice(0, 2).toUpperCase()), text);
    return row;
  });
}

function frame(name: string, title: string): { element: HTMLElement; body: HTMLElement } {
  const element = document.createElement('section');
  element.className = 'im-panel';
  element.dataset.gPanel = name;
  element.setAttribute('aria-label', title);
  const header = document.createElement('header');
  header.className = 'im-panel-header';
  const heading = document.createElement('h4');
  heading.className = 'im-panel-title';
  heading.textContent = title;
  header.append(heading);
  const body = document.createElement('div');
  body.className = 'im-panel-body';
  element.append(header, body);
  return { element, body };
}

function panel(name: string, title: string, initial: PanelState): HTMLElement {
  const { element, body } = frame(name, title);
  body.append(...sessionRows());
  setPanelState(element, initial);
  return element;
}

// A panel whose body is the string of its state: an app that repaints from strings writes the layer itself, and the
// aria-busy of a loading panel on the panel, as setPanelState does.
function panelFromString(name: string, title: string, state: PanelStateMarkup): HTMLElement {
  const { element, body } = frame(name, title);
  body.innerHTML = panelStateHtml(state);
  if (state.kind === 'loading') element.setAttribute('aria-busy', 'true');
  return element;
}

// The buttons setPanelState makes for the action and the Retry below, written as an app writes them in a string.
const NEW_ROOM = '<button class="im-btn" type="button"><span>New room</span><kbd class="im-key">N</kbd></button>';
const RETRY = '<button class="im-btn" type="button"><span>Retry</span></button>';
const EMPTY_TEXT = 'No rooms yet. A room is where your agents talk to each other.';
const ERROR_TEXT = "Couldn't load the sessions. Last updated 09:14.";

function containerFor(root: HTMLElement, sections?: HTMLElement): HTMLElement {
  const parent = sections ?? root.parentElement ?? document.body;
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
  }
  if (container.parentElement !== parent) parent.append(container);
  // The tokens hang on these attributes, so the panels need the same ones as the shell above.
  for (const { name, value } of Array.from(root.attributes)) {
    if (name.startsWith('data-im-')) container.setAttribute(name, value);
  }
  // Outside the shell the panels still need what the shell gives them: its text, its panel padding and a sheet to sit on.
  container.style.cssText = [
    'display: grid',
    'grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))',
    'align-items: start',
    'gap: var(--im-s-4)',
    'padding: var(--im-s-4)',
    'color: var(--im-text)',
    'font: 400 13px/1.45 var(--im-font-text)',
    'background: var(--im-sheet)',
    'border: 1px solid var(--im-line)',
    'border-radius: var(--im-r-sheet)',
    '--im-pane-pad: var(--im-s-4)',
    '--im-list-pad: var(--im-s-2)',
    '--im-head-c: var(--im-text-hi)',
    '--im-head-w: 600',
  ].join('; ');
  container.replaceChildren();
  return container;
}

// Three panels under the shell, one in each state, and the same three filled from strings. The test switches them through
// window.__imagoPanelState.
export default function mount({ root, sections }: MountContext): () => void {
  const container = containerFor(root, sections);
  const panels = {
    empty: panel('empty', 'Rooms', {
      kind: 'empty',
      text: EMPTY_TEXT,
      action: { label: 'New room', keys: 'N', run: () => {} },
    }),
    loading: panel('loading', 'Sessions', { kind: 'loading', rows: 3 }),
    error: panel('error', 'Sessions', {
      kind: 'error',
      text: ERROR_TEXT,
      retry: { label: 'Retry', run: () => {} },
    }),
  };
  const fromStrings = {
    empty: panelFromString('string-empty', 'Rooms', { kind: 'empty', text: EMPTY_TEXT, actionHtml: NEW_ROOM }),
    loading: panelFromString('string-loading', 'Sessions', { kind: 'loading', rows: 3 }),
    error: panelFromString('string-error', 'Sessions', { kind: 'error', text: ERROR_TEXT, retryHtml: RETRY }),
  };
  container.append(panels.empty, panels.loading, panels.error, fromStrings.empty, fromStrings.loading, fromStrings.error);
  window.__imagoPanelState = { setPanelState, panelStateHtml, panels, fromStrings };

  return () => {
    delete window.__imagoPanelState;
    container.remove();
  };
}
