export type ProcessStep = {
  label: string;
  detail?: string;
  state: 'todo' | 'now' | 'done' | 'failed' | 'skipped';
  action?: { id?: string; disabled?: boolean; activate: () => void };
};

function stepItem(doc: Document, step: ProcessStep, index: number) {
  const item = doc.createElement('li');
  const mark = doc.createElement('span');
  mark.className = 'im-step-index';
  mark.setAttribute('aria-hidden', 'true');
  const title = doc.createElement('span');
  title.className = 'im-step-text';
  title.textContent = step.label;
  if (step.detail) {
    const detail = doc.createElement('small');
    detail.className = 'im-step-sub';
    detail.textContent = step.detail;
    title.append(detail);
  }
  let body: HTMLElement = item;
  if (step.action) {
    const button = doc.createElement('button');
    button.type = 'button';
    if (step.action.id) button.id = step.action.id;
    button.disabled = Boolean(step.action.disabled);
    button.onclick = step.action.activate;
    item.append(button);
    body = button;
  }
  body.append(mark, title);
  function setState(state: ProcessStep['state'], current: boolean) {
    item.dataset.imStep = state;
    if (current) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
    mark.textContent = state === 'done' ? '✓' : state === 'failed' ? '!' : String(index + 1);
  }
  return { item, setState };
}

function processList(doc: Document, label: string) {
  const element = doc.createElement('ol');
  element.className = 'im-steps';
  element.setAttribute('aria-label', label);
  return element;
}

/** Independently reported step states, with optional actions for navigable stages. */
export function stepList(doc: Document, label: string, steps: readonly ProcessStep[]) {
  const element = processList(doc, label);
  const current = steps.findIndex(step => step.state === 'now');
  steps.forEach((step, i) => {
    const row = stepItem(doc, step, i);
    row.setState(step.state, i === current);
    element.append(row.item);
  });
  return element;
}

/** Current is zero-based. Passing the number of steps marks the whole process complete. */
export function stepProgress(doc: Document, label: string, steps: readonly string[], current = 0, completeLabel = 'All steps complete') {
  const element = processList(doc, label);
  const items = steps.map((text, i) => stepItem(doc, { label: text, state: 'todo' }, i));
  for (const row of items) element.append(row.item);
  const status = doc.createElement('span');
  status.className = 'im-step-status';
  status.setAttribute('role', 'status');
  items.at(-1)?.item.append(status);
  function setCurrent(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > steps.length) throw new RangeError('Invalid step index');
    const message = value === steps.length ? completeLabel : '';
    if (status.textContent !== message) status.textContent = message;
    items.forEach((row, i) => row.setState(i < value ? 'done' : i === value ? 'now' : 'todo', i === value));
  }
  setCurrent(current);
  return { element, setCurrent };
}

/** An inline loading message with a visible label and a decorative spinner. */
export function loader(doc: Document, label: string): HTMLElement {
  const status = doc.createElement('span');
  status.className = 'im-loader';
  status.setAttribute('role', 'status');
  const spinner = doc.createElement('span');
  spinner.className = 'im-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  status.append(spinner, label);
  return status;
}
