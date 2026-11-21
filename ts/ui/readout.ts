/** A number, its meaning, and optional context. All supplied text is rendered literally. */
export function metric(doc: Document, value: string, label: string, detail?: string): HTMLElement {
  const card = doc.createElement('dl');
  card.className = 'im-metric';
  const title = doc.createElement('dt');
  title.textContent = label;
  const number = doc.createElement('dd');
  number.className = 'im-metric-value';
  number.textContent = value;
  card.append(title, number);
  if (detail) {
    const hint = doc.createElement('dd');
    hint.className = 'im-caption';
    hint.textContent = detail;
    card.append(hint);
  }
  return card;
}

/** Keep the painted and accessible values of a determinate or busy progress bar together. */
export function setProgress(element: HTMLElement, percent: number | null): void {
  element.classList.add('im-progress');
  element.setAttribute('role', 'progressbar');
  if (percent === null) {
    element.removeAttribute('aria-valuenow');
    element.style.removeProperty('--im-progress');
    return;
  }
  if (!Number.isFinite(percent)) throw new RangeError('Invalid progress');
  const value = String(Math.max(0, Math.min(100, percent)));
  element.setAttribute('aria-valuenow', value);
  element.style.setProperty('--im-progress', value);
}
