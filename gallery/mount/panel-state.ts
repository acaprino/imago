import { setPanelState, type PanelState } from '../../ts/ui/panel-state.ts';
import type { MountContext } from '../main.ts';

declare global {
  interface Window {
    __imagoPanelState?: {
      setPanelState: typeof setPanelState;
      panels: { empty: HTMLElement; loading: HTMLElement; error: HTMLElement };
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

function panel(name: string, title: string, initial: PanelState): HTMLElement {
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
  body.append(...sessionRows());
  element.append(header, body);
  setPanelState(element, initial);
  return element;
}

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

// Three panels under the shell, one in each state. The test switches them through window.__imagoPanelState.
export default function mount({ root, sections }: MountContext): () => void {
  const container = containerFor(root, sections);
  const panels = {
    empty: panel('empty', 'Rooms', {
      kind: 'empty',
      text: 'No rooms yet. A room is where your agents talk to each other.',
      action: { label: 'New room', keys: 'N', run: () => {} },
    }),
    loading: panel('loading', 'Sessions', { kind: 'loading', rows: 3 }),
    error: panel('error', 'Sessions', {
      kind: 'error',
      text: "Couldn't load the sessions. Last updated 09:14.",
      retry: { label: 'Retry', run: () => {} },
    }),
  };
  container.append(panels.empty, panels.loading, panels.error);
  window.__imagoPanelState = { setPanelState, panels };

  return () => {
    delete window.__imagoPanelState;
    container.remove();
  };
}
