/** The host lays out its panes and saves a size only after a completed gesture. */
export function splitter(doc: Document, options: {
  label: string;
  controls?: string;
  orientation?: 'vertical' | 'horizontal';
  reverse?: boolean;
  min: number;
  max: number;
  value: number;
  onResize: (pixels: number) => void;
  onCommit?: (pixels: number) => void;
}) {
  let { min, max } = options;
  const { orientation = 'vertical' } = options;
  if (![min, max, options.value].every(Number.isFinite) || min > max) throw new RangeError('Invalid splitter bounds');
  const element = doc.createElement('div');
  element.className = 'im-splitter';
  element.tabIndex = 0;
  element.setAttribute('role', 'separator');
  element.setAttribute('aria-label', options.label);
  element.setAttribute('aria-orientation', orientation);
  element.setAttribute('aria-valuemin', String(min));
  element.setAttribute('aria-valuemax', String(max));
  if (options.controls) element.setAttribute('aria-controls', options.controls);
  const vertical = orientation === 'vertical';
  // Direction is inherited from the host after mounting. An explicit reverse flag takes precedence.
  const sign = () => (options.reverse ?? (vertical && doc.defaultView?.getComputedStyle(element).direction === 'rtl')) ? -1 : 1;
  let value = options.value;
  function setValue(pixels: number) {
    if (!Number.isFinite(pixels)) return;
    value = Math.max(min, Math.min(max, Math.round(pixels)));
    element.setAttribute('aria-valuenow', String(value));
    element.setAttribute('aria-valuetext', value + ' px');
    options.onResize(value);
  }
  let drag: { id: number; start: number; value: number; sign: number } | undefined;
  const position = (event: PointerEvent) => vertical ? event.clientX : event.clientY;
  function finish(commit: boolean) {
    if (!drag) return;
    const before = drag;
    drag = undefined;
    if (element.hasPointerCapture(before.id)) element.releasePointerCapture(before.id);
    if (!commit) setValue(before.value);
    else options.onCommit?.(value);
  }
  element.onkeydown = event => {
    if (event.key === 'Escape' && drag) {
      finish(false);
    } else {
      if (drag || event.altKey || event.metaKey || event.ctrlKey) return;
      const step = (event.shiftKey ? 32 : 8) * sign();
      if (event.key === 'Home') setValue(min);
      else if (event.key === 'End') setValue(max);
      else if (event.key === (vertical ? 'ArrowLeft' : 'ArrowUp')) setValue(value - step);
      else if (event.key === (vertical ? 'ArrowRight' : 'ArrowDown')) setValue(value + step);
      else return;
      options.onCommit?.(value);
    }
    event.preventDefault();
    event.stopPropagation();
  };
  element.onpointerdown = event => {
    if (drag || event.button !== 0 || !event.isPrimary) return;
    element.focus();
    element.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, start: position(event), value, sign: sign() };
  };
  element.onpointermove = event => {
    if (drag?.id === event.pointerId) setValue(drag.value + drag.sign * (position(event) - drag.start));
  };
  element.onpointerup = event => {
    if (drag?.id !== event.pointerId) return;
    setValue(drag.value + drag.sign * (position(event) - drag.start));
    finish(true);
  };
  element.onpointercancel = element.onlostpointercapture = event => {
    if (drag?.id === event.pointerId) finish(false);
  };
  setValue(value);
  function setBounds(lower: number, upper: number, next = value) {
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) throw new RangeError('Invalid splitter bounds');
    min = lower;
    max = upper;
    element.setAttribute('aria-valuemin', String(min));
    element.setAttribute('aria-valuemax', String(max));
    setValue(next);
  }
  return { element, setValue, setBounds };
}
