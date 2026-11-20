// One stack for everything that floats over the window: menus, sheets, dialogs and the palette.
// The stack decides what Escape closes (the top layer only), what a press outside closes (a menu
// or a sheet) and where focus goes back to. Nothing touches the DOM when this module is imported,
// so the stack logic also runs under plain Node.

export type LayerKind = 'menu' | 'sheet' | 'dialog' | 'palette';

export type Layer = {
  el: HTMLElement;
  kind: LayerKind;
  /**
   * The opener is a control that toggles the layer (a menu, or a sheet docked below its control): pressing it
   * closes the layer and swallows the click that follows, so it is not opened again. Left out for a layer docked
   * to a pane, where a press in the pane outside the layer closes it and still reaches what was pressed.
   */
  toggles?: boolean;
  /** Removes the layer from the screen and pops it. Closing twice does nothing. */
  close: () => void;
  /** Releases a layer when its shell unmounts, even if user dismissal is locked. */
  dispose?: () => void;
};

type Entry = { layer: Layer; opener: HTMLElement | null };

const stack: Entry[] = [];
// The document the layers live in, to find the notice hosts that a modal layer makes inert.
let layerDocument: Document | null = null;

const isModal = (layer: Layer): boolean => layer.kind === 'dialog' || layer.kind === 'palette';

// A layer under a modal one cannot be reached: it stays on screen but is inert until the modal closes.
// A layer above the modal (a menu opened from inside a dialog) stays live.
// Notices keep showing under a modal layer but cannot be pressed: an Undo must not act over a pending confirm.
function sync(): void {
  let modal = -1;
  stack.forEach((entry, index) => {
    if (isModal(entry.layer)) modal = index;
  });
  stack.forEach((entry, index) => {
    entry.layer.el.inert = index < modal;
  });
  const hosts = layerDocument?.querySelectorAll?.<HTMLElement>('[data-im-notices]');
  hosts?.forEach((host) => {
    host.inert = modal >= 0;
  });
}

/** Whether a dialog or the palette is open: what is under the title bar, notices included, cannot be reached. */
export function hasModal(): boolean {
  return stack.some((entry) => isModal(entry.layer));
}

// Focus goes back to the opener only when the popped layer was the top one and focus is stranded:
// still inside the layer, or nowhere. It never pulls focus away from where the user has gone on working.
function restoreFocus({ layer, opener }: Entry): void {
  if (!opener || !opener.isConnected) return;
  if (opener.closest?.('[inert]')) return;
  const doc = opener.ownerDocument;
  const active = doc?.activeElement ?? null;
  const stranded = !doc || !active || active === doc.body || (layer.el.contains?.(active) ?? false);
  if (stranded) opener.focus();
}

/** Puts a layer on top of the stack. The returned `pop` removes it, in any order, and is safe to call twice. */
export function pushLayer(layer: Layer, opener: HTMLElement | null): () => void {
  const entry: Entry = { layer, opener };
  stack.push(entry);
  layerDocument = layer.el.ownerDocument ?? layerDocument;
  sync();
  return function pop() {
    const index = stack.indexOf(entry);
    if (index === -1) return;
    const wasTop = index === stack.length - 1;
    stack.splice(index, 1);
    sync();
    if (wasTop) restoreFocus(entry);
  };
}

export function topLayer(): Layer | undefined {
  return stack.at(-1)?.layer;
}

export function hasDialog(): boolean {
  return stack.some((entry) => entry.layer.kind === 'dialog');
}

/** Whether a layer of this kind is open. */
export function hasLayer(kind: LayerKind): boolean {
  return stack.some((entry) => entry.layer.kind === kind);
}

/** Closes every open layer of these kinds, the top one first. */
export function closeLayers(kinds: readonly LayerKind[]): void {
  for (const entry of [...stack].reverse()) if (kinds.includes(entry.layer.kind)) entry.layer.close();
}

// What a modal layer makes inert: every part of the shell that is not the title bar (or holds it) and
// not one of the surfaces themselves. Counted per element, so two modal layers release independently,
// and an element the app had made inert itself stays so.
const holds = new WeakMap<Element, { count: number; was: boolean }>();

function regionsBelowTitleBar(shell: Element): Element[] {
  const titleBar = shell.querySelector('.im-titlebar');
  const found: Element[] = [];
  const walk = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      if (child === titleBar || child.matches('[data-im-layer], [data-im-notices]')) continue;
      if (titleBar && child.contains(titleBar)) walk(child);
      else found.push(child);
    }
  };
  walk(shell);
  return found;
}

/** Makes everything under the title bar inert. The returned function undoes it, whatever path closes the surface. */
export function inertShell(shell: Element): () => void {
  const targets = regionsBelowTitleBar(shell);
  for (const el of targets) {
    const hold = holds.get(el);
    if (hold) hold.count++;
    else {
      holds.set(el, { count: 1, was: el.hasAttribute('inert') });
      el.setAttribute('inert', '');
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const el of targets) {
      const hold = holds.get(el);
      if (!hold) continue;
      hold.count--;
      if (hold.count > 0) continue;
      holds.delete(el);
      if (!hold.was) el.removeAttribute('inert');
    }
  };
}

// ---------- helpers the surfaces share (they touch the DOM only when called) ----------

const TABBABLE =
  'a[href], button, input, select, textarea, details > summary:first-of-type, [contenteditable=""], [contenteditable="true"], [tabindex]';

/** The elements Tab visits inside a surface, in order. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(el => {
    if (el.matches(':disabled, input[type="hidden"]') || (el.hasAttribute('tabindex') && el.tabIndex < 0)) return false;
    if (el.closest('[inert]') || !el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') return false;
    // Only the first summary and its contents are reachable inside a closed disclosure.
    let closed = el.parentElement?.closest('details:not([open])');
    while (closed) {
      if (!closed.querySelector(':scope > summary:first-of-type')?.contains(el)) return false;
      closed = closed.parentElement?.closest('details:not([open])');
    }
    return true;
  });
}

/** Keeps Tab and Shift+Tab inside `root`: from the last control to the first, and back. */
export function trapTab(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const items = tabbables(root);
  if (!items.length) {
    event.preventDefault();
    root.focus();
    return;
  }
  const active = root.ownerDocument.activeElement;
  const edge = event.shiftKey ? items[0] : items[items.length - 1];
  if (active === edge || !items.includes(active as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? items[items.length - 1] : items[0]).focus();
  }
}

/** The shell an anchor belongs to: surfaces are placed inside it, so they inherit its tokens and its container. */
export function shellOf(el: Element): HTMLElement {
  return el.closest<HTMLElement>('.im-shell') ?? el.ownerDocument.body;
}

/** What names a surface opened from `anchor`: the anchor's own label. */
export function nameOf(anchor: HTMLElement): string {
  return anchor.getAttribute('aria-label') || anchor.title || anchor.textContent?.trim() || '';
}

/** Puts `el` under `anchor` (above it when there is no room below), inside the window, in the shell's own coordinates. */
export function placeBelow(shell: HTMLElement, anchor: HTMLElement, el: HTMLElement, gap = 4): void {
  const edge = 8;
  const box = shell.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const left = Math.max(edge, Math.min(at.left - box.left, box.width - el.offsetWidth - edge));
  let top = at.bottom - box.top + gap;
  const above = at.top - box.top - gap - el.offsetHeight;
  if (top + el.offsetHeight > box.height - edge && above >= edge) top = above;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/** Calls `place` on every frame until the returned function stops it: the anchor moves with splitters and resizes. */
export function follow(place: () => void): () => void {
  let frame = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    place();
    // `place` may stop the loop (a sheet whose anchor left the document closes itself).
    if (!stopped) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}

type KeyLike = {
  key: string;
  target?: EventTarget | null;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  preventDefault?: () => void;
  stopImmediatePropagation?: () => void;
};

type PressLike = { target: unknown };

const isNode = (value: unknown): value is Node => typeof Node !== 'undefined' && value instanceof Node;

type EventHost = {
  addEventListener(type: string, listener: (event: never) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: never) => void, capture?: boolean): void;
};

/**
 * Escape closes the top layer and nothing else: the press stops there, so no other handler also acts on it.
 * A press outside closes a menu or a sheet, and a press on the control that toggles it closes it and swallows
 * the click that follows, so the control does not open it again. The returned function detaches the listeners
 * and closes every layer still open (the shell they belong to is going away).
 */
export function attachLayers(shell: HTMLElement): () => void {
  const doc = shell.ownerDocument as unknown as EventHost;
  let swallow: Node | null = null;

  const onKeyDown = (event: KeyLike): void => {
    swallow = null; // a key press is not the click that follows a press on an opener
    if (event.key !== 'Escape' || event.repeat || event.isComposing || event.keyCode === 229) return;
    const top = topLayer();
    if (!top) return;
    // The focused picker in this layer gets the first Escape to dismiss its own results.
    const picker = (event.target as Element | null)?.closest?.('.im-search-picker');
    if (picker && top.el.contains(picker) && picker.querySelector('input[role="combobox"][aria-expanded="true"]')) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    top.close();
  };

  const onPointerDown = (event: PressLike): void => {
    swallow = null;
    const entry = stack.at(-1);
    if (!entry || (entry.layer.kind !== 'menu' && entry.layer.kind !== 'sheet')) return;
    const target = event.target;
    if (!isNode(target) || entry.layer.el.contains(target)) return;
    const onOpener = entry.layer.toggles === true && entry.opener?.contains(target) === true;
    // The window frame is not "outside" a sheet: pressing the title bar to move the window keeps it.
    const pressed = target instanceof Element ? target : target.parentElement;
    if (!onOpener && entry.layer.kind === 'sheet' && pressed?.closest('.im-titlebar')) return;
    entry.layer.close();
    if (onOpener) swallow = entry.opener;
  };

  // The click follows the release at once. A press that never clicks (released elsewhere, cancelled) must not
  // leave the opener's next click, from the keyboard, to be eaten.
  const onRelease = (): void => {
    setTimeout(() => {
      swallow = null;
    }, 0);
  };

  const onClick = (event: PressLike & { preventDefault(): void; stopImmediatePropagation(): void }): void => {
    const pressed = swallow;
    swallow = null;
    if (pressed && isNode(event.target) && pressed.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('pointerup', onRelease, true);
  doc.addEventListener('pointercancel', onRelease, true);
  return () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('pointerup', onRelease, true);
    doc.removeEventListener('pointercancel', onRelease, true);
    swallow = null;
    for (const { layer } of [...stack].reverse()) {
      if (layer.dispose) layer.dispose();
      else layer.close();
    }
  };
}
