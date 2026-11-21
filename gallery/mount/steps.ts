import { stepList } from '../../ts/ui/progress.ts';
import { stepNavigationHtml, stepNavigationKey } from '../../ts/ui/wizard-markup.ts';
import type { MountContext } from '../main.ts';

const CONTAINER_ID = 'im-gallery-steps';

const STEPS = [
  { id: 'scan', label: 'Scan', detail: 'Inventory' },
  { id: 'analyze', label: 'Analyze', detail: 'By technology' },
  { id: 'union', label: 'Union', detail: 'Join the graphs' },
];
// The states of a step that can be opened, each on the first step of its own list. The gallery forces hover, press and
// focus with data-im-force, as the matrix does.
const STATES = ['rest', 'hover', 'press', 'focus', 'selected', 'disabled'] as const;

function list(state: (typeof STATES)[number]): HTMLElement {
  const box = document.createElement('div');
  box.dataset.gSteps = state;
  const steps = STEPS.map((step) => ({ ...step, disabled: state === 'disabled' && step.id === 'scan' }));
  box.innerHTML = stepNavigationHtml(steps, state === 'selected' ? 'scan' : 'analyze', {
    label: `Steps, ${state}`, action: 'g-step', tabIdPrefix: `g-step-${state}-`, panelId: `g-step-panel-${state}`,
  }) + `<div role="tabpanel" id="g-step-panel-${state}" hidden></div>`;
  const first = box.querySelector<HTMLElement>('[data-id="scan"]');
  if (first && (state === 'hover' || state === 'press' || state === 'focus')) first.dataset.imForce = state;
  return box;
}

// A list the keyboard drives: the arrows move the selection, as an app does with stepNavigationKey.
function live(): HTMLElement {
  const box = document.createElement('div');
  box.dataset.gSteps = 'live';
  const paint = (selected: string): void => {
    box.innerHTML = stepNavigationHtml(STEPS, selected, { label: 'Analysis', action: 'g-live-step', tabIdPrefix: 'g-live-step-', panelId: 'g-live-step-panel' })
      + '<div role="tabpanel" id="g-live-step-panel" hidden></div>';
  };
  paint('scan');
  box.addEventListener('keydown', (event) => {
    stepNavigationKey(event, {
      ids: STEPS.map((step) => step.id),
      action: 'g-live-step',
      onSelect: (id) => {
        paint(id);
        box.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
      },
    });
  });
  return box;
}

// The same drawing from the DOM builder: a list of process steps, two of which can be opened.
function process(): HTMLElement {
  const box = document.createElement('div');
  box.dataset.gSteps = 'process';
  box.append(stepList(document, 'Pipeline', [
    { label: 'Scan', detail: 'Inventory', state: 'done', action: { activate: () => {} } },
    { label: 'Analyze', detail: 'By technology', state: 'now', action: { activate: () => {} } },
    { label: 'Union', detail: 'Join the graphs', state: 'todo' },
  ]));
  return box;
}

export default function mount({ root, sections }: MountContext): () => void {
  const parent = sections ?? root.parentElement ?? document.body;
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  // The tokens hang on these attributes, so the lists need the same ones as the shell above.
  for (const { name, value } of Array.from(root.attributes)) {
    if (name.startsWith('data-im-')) container.setAttribute(name, value);
  }
  container.style.cssText = [
    'display: grid',
    'gap: var(--im-s-4)',
    'padding: var(--im-s-4)',
    'color: var(--im-text)',
    'font: 400 13px/1.45 var(--im-font-text)',
    'background: var(--im-sheet)',
    'border: 1px solid var(--im-line)',
    'border-radius: var(--im-r-sheet)',
  ].join('; ');
  container.append(...STATES.map(list), live(), process());
  const section = document.createElement('section');
  section.className = 'g-block';
  section.setAttribute('aria-labelledby', 'g-h-steps');
  section.innerHTML = '<h2 id="g-h-steps">Steps</h2><p>A step that can be opened, in each of its states; a list the arrow keys drive; and the process steps of stepList, two of which open.</p>';
  section.append(container);
  parent.append(section);
  return () => section.remove();
}
