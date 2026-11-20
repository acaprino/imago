/** Current is zero-based. Passing the number of steps marks the whole process complete. */
export function stepProgress(doc: Document, label: string, steps: readonly string[], current = 0) {
  const element = doc.createElement('ol');
  element.className = 'im-steps';
  element.setAttribute('aria-label', label);
  const items = steps.map((text, index) => {
    const item = doc.createElement('li');
    const mark = doc.createElement('span');
    mark.className = 'im-step-index';
    mark.setAttribute('aria-hidden', 'true');
    const name = doc.createElement('span');
    name.className = 'im-step-text';
    name.textContent = text;
    item.append(mark, name);
    element.append(item);
    return { item, mark, index };
  });
  function setCurrent(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > steps.length) throw new RangeError('Invalid step index');
    for (const { item, mark, index } of items) {
      item.dataset.imStep = index < value ? 'done' : index === value ? 'now' : 'todo';
      if (index === value) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      mark.textContent = index < value ? '✓' : String(index + 1);
    }
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
