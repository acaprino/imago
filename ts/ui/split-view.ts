import { splitter } from './splitter.ts';

/** Two resizable regions. Either child may itself be a split view. */
export function splitView(first: HTMLElement, second: HTMLElement, options: {
  label: string;
  axis?: 'columns' | 'rows';
  fraction?: number;
  minFirst?: number;
  minSecond?: number;
  onCommit?: (fraction: number) => void;
}) {
  const doc = first.ownerDocument;
  const columns = options.axis !== 'rows';
  let fraction = options.fraction ?? 0.5;
  const minFirst = options.minFirst ?? 0;
  const minSecond = options.minSecond ?? 0;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1 ||
      ![minFirst, minSecond].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError('Invalid split dimensions');
  const element = doc.createElement('div');
  element.className = 'im-split-view';
  element.dataset.imAxis = columns ? 'columns' : 'rows';
  let available = 0;
  const handle = splitter(doc, {
    label: options.label, controls: first.id, orientation: columns ? 'vertical' : 'horizontal',
    min: 0, max: 0, value: 0,
    onResize: pixels => element.style.setProperty('--im-pane-size', pixels + 'px'),
    onCommit: pixels => {
      if (available === 0) return;
      fraction = pixels / available;
      options.onCommit?.(fraction);
    },
  });
  element.append(first, handle.element, second);
  function measure() {
    const size = columns ? 'clientWidth' : 'clientHeight';
    available = Math.max(0, element[size] - handle.element[size]);
    // When both minima cannot fit, share the space in proportion to their minima.
    const scale = Math.min(1, available / (minFirst + minSecond || 1));
    handle.setBounds(Math.floor(minFirst * scale), available - Math.floor(minSecond * scale), available * fraction);
  }
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  return { element, destroy: () => observer.disconnect() };
}
