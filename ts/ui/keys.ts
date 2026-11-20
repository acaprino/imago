// Keyboard movement: arrows inside a list, one tab stop per list, F6 between regions.
// Nothing here touches the DOM when the module is imported.

export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';
export type Orientation = 'vertical' | 'horizontal';

export interface RovingOptions {
  /** Selector of the items, matched inside the container. */
  item: string;
  /** Which arrows move: Up and Down for vertical, Left and Right for horizontal. */
  orientation: Orientation;
  /** Called with the focused item on Space or Enter, which then do not click it. */
  onSelect?: (el: HTMLElement) => void;
}

const NAV_KEYS = new Set<string>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
const isNavKey = (key: string): key is NavKey => NAV_KEYS.has(key);

/**
 * The index the key leads to. It clamps at both ends and never wraps.
 * Returns -1 when the key does not apply: an arrow of the other orientation, or an empty list.
 */
export function nextIndex(current: number, count: number, key: NavKey, orientation: Orientation): number {
  if (count <= 0) return -1;
  const last = count - 1;
  const clamp = (index: number) => Math.min(Math.max(index, 0), last);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  const [back, forward] = orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
  if (key === back) return clamp(current - 1);
  if (key === forward) return clamp(current + 1);
  return -1;
}

const isEnabled = (el: HTMLElement) => !el.matches(':disabled, [aria-disabled="true"]');
const isRendered = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const canFocus = (el: HTMLElement) => isEnabled(el) && isRendered(el) && el.closest('[inert]') === null;

const hasModifier = (event: KeyboardEvent) => event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;

/**
 * Makes the container one tab stop: a single item has tabindex="0" (the selected one, else the first),
 * the others -1, and the arrows, Home and End move focus between them. Space and Enter call onSelect.
 * Items added later are picked up. The returned function stops it and restores the items' tabindex.
 */
export function roving(container: HTMLElement, options: RovingOptions): () => void {
  const { item, orientation, onSelect } = options;
  const original = new Map<HTMLElement, string | null>();
  let stop: HTMLElement | null = null;

  const items = () => Array.from(container.querySelectorAll<HTMLElement>(item));

  const setTabIndex = (el: HTMLElement, value: string) => {
    if (!original.has(el)) original.set(el, el.getAttribute('tabindex'));
    if (el.getAttribute('tabindex') !== value) el.setAttribute('tabindex', value);
  };

  // The stop is chosen without looking at visibility: a list hidden by a breakpoint still needs
  // its stop when it comes back, and nothing tells us when that happens.
  const sync = () => {
    const rows = items();
    const present = new Set(rows);
    for (const el of original.keys()) if (!present.has(el)) original.delete(el);
    if (!stop || !present.has(stop) || !isEnabled(stop)) {
      const enabled = rows.filter(isEnabled);
      stop = enabled.find((el) => el.getAttribute('aria-selected') === 'true') ?? enabled[0] ?? null;
    }
    for (const el of rows) setTabIndex(el, el === stop ? '0' : '-1');
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const { key } = event;
    const selects = onSelect !== undefined && (key === 'Enter' || key === ' ');
    if ((!isNavKey(key) && !selects) || event.defaultPrevented || hasModifier(event)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const rows = items().filter(canFocus);
    const current = rows.indexOf(target); // a control nested inside a row is not a row: leave its keys alone
    if (current === -1) return;
    if (isNavKey(key)) {
      const next = nextIndex(current, rows.length, key, orientation);
      if (next === -1) return;
      event.preventDefault();
      rows[next].focus();
    } else {
      event.preventDefault();
      onSelect?.(target);
    }
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>(item);
    if (row && row !== stop && container.contains(row) && isEnabled(row)) {
      stop = row;
      sync();
    }
  };

  const observer = new MutationObserver(sync);
  observer.observe(container, { childList: true, subtree: true });
  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('focusin', onFocusIn);
  sync();

  return () => {
    observer.disconnect();
    container.removeEventListener('keydown', onKeyDown);
    container.removeEventListener('focusin', onFocusIn);
    for (const [el, value] of original) {
      if (value === null) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', value);
    }
    original.clear();
  };
}

const REGIONS = ['.im-sidebar', '.im-content', '.im-inspector'];
const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable=""], [contenteditable="true"], [tabindex]';

// Where focus lands in a region: its roving stop (tabindex="0"), else its first focusable element.
function entryPoint(region: HTMLElement): HTMLElement | null {
  const first = (selector: string) =>
    Array.from(region.querySelectorAll<HTMLElement>(selector)).find((el) => el.tabIndex >= 0 && canFocus(el)) ?? null;
  return first('[tabindex="0"]') ?? first(FOCUSABLE);
}

/**
 * F6 moves focus to the next region, Shift+F6 to the previous: sidebar, content, inspector, then round
 * again. A region that is not visible, or has nothing to focus, is skipped. Also works when nothing
 * is focused. The returned function stops it.
 */
export function regions(shell: HTMLElement): () => void {
  const doc = shell.ownerDocument;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'F6' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const active = doc.activeElement;
    if (active && active !== doc.body && active !== doc.documentElement && !shell.contains(active)) return;

    const found = REGIONS.map((selector) => shell.querySelector<HTMLElement>(selector));
    const count = found.length;
    const step = event.shiftKey ? -1 : 1;
    const current = found.findIndex((region) => region !== null && active !== null && region.contains(active));
    const from = current === -1 ? (step === 1 ? -1 : 0) : current;
    for (let k = 1; k <= count; k++) {
      const region = found[(((from + step * k) % count) + count) % count];
      const entry = region && isRendered(region) ? entryPoint(region) : null;
      if (entry) {
        event.preventDefault();
        entry.focus();
        return;
      }
    }
  };

  doc.addEventListener('keydown', onKeyDown);
  return () => doc.removeEventListener('keydown', onKeyDown);
}
