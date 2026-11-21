// State belonging to the DOM, rather than an application's model, during a synchronous repaint.
// Keep the shell and modal boundary stable; capture the children before replacing their content.

export interface FocusSnapshot {
  key: string;
  selection: { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null;
}

export interface DomSnapshot {
  focus: FocusSnapshot | null;
  details: { key: string; open: boolean }[];
  scroll: { selector: string; index: number; top: number; left: number }[];
}

/** A CSS quoted-string value, including control characters. Does not require a global CSS object. */
function cssString(value: string): string {
  return value.replace(/[\0-\x1f\x7f"\\]/g, character => {
    if (character === '\0') return '\ufffd';
    if (character === '"' || character === '\\') return '\\' + character;
    return '\\' + character.charCodeAt(0).toString(16) + ' ';
  });
}

/** A stable selector for a focused control; explicit data-im-key/id take precedence. */
export function focusKey(element: Element | null, within: Element): string {
  if (!element || element === within || !within.contains(element) || !('focus' in element)) return '';
  for (const name of ['data-im-key', 'id']) {
    const value = element.getAttribute(name);
    if (value) return `[${name}="${cssString(value)}"]`;
  }
  const graphNode = element.closest('[data-im-node]');
  if (graphNode) {
    const control = ['im-graph-node', 'im-graph-open', 'im-graph-expand'].find(name => element.classList.contains(name));
    if (control) return `[data-im-node="${cssString(graphNode.getAttribute('data-im-node')!)}"] > .${control}`;
  }
  const attributes = ['data-action', 'data-id', 'name', 'value'].filter(name => element.hasAttribute(name)
    && (name !== 'value' || /^(radio|checkbox)$/.test(element.getAttribute('type') ?? '')));
  return attributes.length ? element.localName + attributes.map(name => `[${name}="${cssString(element.getAttribute(name)!)}"]`).join('') : '';
}

function caret(element: HTMLElement): FocusSnapshot['selection'] {
  if (element.localName !== 'input' && element.localName !== 'textarea') return null;
  const control = element as HTMLInputElement | HTMLTextAreaElement;
  try {
    return control.selectionStart === null ? null : {
      start: control.selectionStart, end: control.selectionEnd ?? control.selectionStart,
      direction: control.selectionDirection ?? 'none',
    };
  } catch { return null; } // Unsupported input types have no text selection.
}

export function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = root.ownerDocument.activeElement;
  const key = focusKey(active, root);
  return key ? { key, selection: caret(active as HTMLElement) } : null;
}

export interface RestoreFocusOptions {
  fallback?: HTMLElement | null;
  preventScroll?: boolean;
}

/** Disabled, hidden and inert descendants cannot become the repaint's focus target. */
function available(element: HTMLElement | null): element is HTMLElement {
  return !!element && !element.matches(':disabled') && !element.closest('[inert],[hidden],[aria-hidden="true"]');
}

/** Returns the control that received focus, or null. A disabled target may use an explicit fallback. */
export function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null, options: RestoreFocusOptions = {}): HTMLElement | null {
  const candidate = snapshot ? root.querySelector<HTMLElement>(snapshot.key) : null;
  const target = available(candidate) ? candidate : available(options.fallback ?? null) ? options.fallback! : null;
  if (!target) return null;
  target.focus({ preventScroll: options.preventScroll ?? true });
  if (target === candidate && snapshot?.selection && (target.localName === 'input' || target.localName === 'textarea')) {
    const { start, end, direction } = snapshot.selection;
    try { (target as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(start, end, direction); } catch { /* Input type changed. */ }
  }
  return target;
}

/** Scroll selectors are supplied by composition; multiple matching regions retain their own offset. */
export function captureDomState(root: HTMLElement, options: { scroll?: readonly string[] } = {}): DomSnapshot {
  return {
    focus: captureFocus(root),
    details: Array.from(root.querySelectorAll<HTMLDetailsElement>('details[id],details[data-im-key]'))
      .map(element => ({ key: focusKey(element, root), open: element.open })).filter(detail => !!detail.key),
    scroll: (options.scroll ?? ['[data-im-scroll]']).flatMap(selector =>
      Array.from(root.querySelectorAll<HTMLElement>(selector)).map((element, index) => ({
        selector, index, top: element.scrollTop, left: element.scrollLeft,
      }))),
  };
}

/** Restore layout state before focus so moving the caret does not undo the preserved scroll. */
export function restoreDomState(root: HTMLElement, state: DomSnapshot, options: RestoreFocusOptions & { focus?: boolean } = {}): void {
  for (const detail of state.details) {
    const element = root.querySelector<HTMLDetailsElement>(detail.key);
    if (element?.localName === 'details') element.open = detail.open;
  }
  for (const scroll of state.scroll) {
    const element = root.querySelectorAll<HTMLElement>(scroll.selector)[scroll.index];
    if (element) { element.scrollTop = scroll.top; element.scrollLeft = scroll.left; }
  }
  if (options.focus !== false) restoreFocus(root, state.focus, options);
}

/** Replaces one trusted HTML region while retaining its interaction state. Other focus is untouched. */
export function replaceHtmlRegion(region: HTMLElement, markup: string, options: {
  fallbackFocus?: () => HTMLElement | null;
  scroll?: readonly string[];
} = {}): HTMLElement {
  const document = region.ownerDocument;
  const active = document.activeElement;
  const hadFocus = active === region || !!active && region.contains(active);
  const state = captureDomState(region, { scroll: options.scroll });
  const ownScroll = { top: region.scrollTop, left: region.scrollLeft };
  const template = document.createElement('template');
  template.innerHTML = markup;
  const replacement = template.content.firstElementChild as HTMLElement | null;
  if (!replacement || template.content.childElementCount !== 1
    || Array.from(template.content.childNodes).some(node => node.nodeType === 3 && !!node.textContent?.trim())) {
    throw new TypeError('A replacement region must contain exactly one HTML element');
  }
  if (region.localName === 'details' && replacement.localName === 'details') {
    (replacement as HTMLDetailsElement).open = (region as HTMLDetailsElement).open;
  }
  region.replaceWith(replacement);
  replacement.scrollTop = ownScroll.top;
  replacement.scrollLeft = ownScroll.left;
  restoreDomState(replacement, state, { focus: false });
  if (hadFocus) {
    if (active === region) replacement.focus({ preventScroll: true });
    else restoreFocus(replacement, state.focus);
    if (!document.activeElement || document.activeElement === document.body || document.activeElement === active) {
      const fallback = options.fallbackFocus?.();
      if (available(fallback ?? null)) fallback!.focus({ preventScroll: true });
    }
  }
  return replacement;
}
