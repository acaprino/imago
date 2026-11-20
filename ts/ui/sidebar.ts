// Two behaviours of the sidebar that need a little script; the layout itself is CSS (css/primitives.css).
//
// The drawer, `sidebarDrawer`. Below 620 the sidebar is not in the layout: a title-bar button (`.im-sidebar-toggle`) opens
// it as an overlay from the left edge (`data-im-sidebar-open` on the shell). The object list of an app must stay
// reachable at the minimum window width and at 200% zoom, by keyboard and by pointer. Opening moves focus into the
// sidebar. A second click on the button, Escape (from anywhere), or a press outside it closes it and gives focus back to
// the button. When focus moves out of the sidebar to anything but the button, it closes too and leaves the focus where
// it went. A floating layer opened from the sidebar (a menu) is not outside. Widening the shell to 620 or more clears
// the open state: the sidebar is then a column or a rail again.
//
// The fold, `sidebarCollapse`. From 850 up a button in the sidebar's header (`.im-sidebar-collapse`) folds the sidebar
// into the 56px rail of icons and unfolds it (`data-im-sidebar-collapsed` on the shell). The app keeps the choice.
//
// Both follow the width: a width change never leaves focus on what it hides. Narrowing below 620 moves focus from the
// sidebar to the drawer's button; widening to 620 moves it from that button to the sidebar's tab stop; narrowing below
// 850 moves it from the fold button, which goes with the header, to the sidebar's tab stop or, with no sidebar on
// screen, to the drawer's button.

/** The shell is narrow below this width; the CSS says the same with `@container im-shell (width < 620px)`. */
const NARROW_BELOW = 620;
/** The fold button is there from this width; the CSS says the same with `@container im-shell (width >= 850px)`. */
const FOLD_FROM = 850;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FLOATING = '[data-im-layer], [data-im-notices]';

/** An element that is not rendered (it, or an ancestor, is `display: none`) has no box: focus() on it does nothing. */
const isRendered = (element: Element): boolean => element.getClientRects().length > 0;

/** The sidebar's tab stop that is on screen: its `[tabindex="0"]`, else its first focusable element; null when none. */
function sidebarStop(sidebar: HTMLElement): HTMLElement | null {
  const onScreen = (selector: string): HTMLElement | null => Array.from(sidebar.querySelectorAll<HTMLElement>(selector)).find(isRendered) ?? null;
  return onScreen('[tabindex="0"]') ?? onScreen(FOCUSABLE);
}

/** Wires the sidebar drawer of one shell. Returns the function that removes every listener and the observer. */
export function sidebarDrawer(shell: HTMLElement): () => void {
  const toggle = shell.querySelector<HTMLElement>('.im-sidebar-toggle');
  const sidebar = shell.querySelector<HTMLElement>('.im-sidebar');
  if (!toggle || !sidebar) return () => {};
  const doc = shell.ownerDocument;
  const win = doc.defaultView;

  const isOpen = (): boolean => shell.dataset.imSidebarOpen === 'true';
  const show = (open: boolean): void => {
    if (open) shell.dataset.imSidebarOpen = 'true';
    else delete shell.dataset.imSidebarOpen;
    toggle.setAttribute('aria-expanded', String(open));
  };
  /** The sidebar, its button and the floating layers (menus, sheets, notices) are not "outside" it. */
  const belongs = (target: EventTarget | null): boolean => {
    if (!(target instanceof Node)) return false;
    if (sidebar.contains(target) || toggle.contains(target)) return true;
    const element = target instanceof Element ? target : target.parentElement;
    return element?.closest(FLOATING) != null;
  };

  /** Focus goes to the sidebar's tab stop that is on screen, else to the sidebar itself. */
  const focusSidebar = (): void => {
    const target = sidebarStop(sidebar);
    if (target) {
      target.focus();
      return;
    }
    sidebar.tabIndex = -1;
    sidebar.focus();
  };
  const open = (): void => {
    show(true);
    focusSidebar();
  };
  const close = (): void => {
    show(false);
    toggle.focus();
  };

  const onToggle = (): void => (isOpen() ? close() : open());
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || !isOpen()) return;
    event.preventDefault();
    close();
  };
  const onPress = (event: Event): void => {
    if (!isOpen() || belongs(event.target)) return;
    show(false);
    // The press puts focus where it landed. When that is nowhere (the page, or the sidebar that just went away),
    // focus goes back to the button instead of being lost.
    win?.setTimeout(() => {
      const active = doc.activeElement;
      if (!active || active === doc.body || sidebar.contains(active)) toggle.focus();
    }, 0);
  };
  const onFocusIn = (event: FocusEvent): void => {
    if (isOpen() && !belongs(event.target)) show(false); // closes and lets the focus stay where it went
  };

  toggle.addEventListener('click', onToggle);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('pointerdown', onPress, true);
  doc.addEventListener('focusin', onFocusIn);

  // A width change can hide the element that has focus: the sidebar when narrowing, the button when widening.
  let narrow: boolean | null = null;
  const observer = win
    ? new win.ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width;
        if (width === undefined) return;
        const wasNarrow = narrow;
        narrow = width < NARROW_BELOW;
        if (!narrow && isOpen()) show(false);
        if (wasNarrow === null || wasNarrow === narrow) return;
        const active = doc.activeElement;
        if (narrow && active && sidebar.contains(active)) toggle.focus();
        else if (!narrow && active === toggle) focusSidebar();
      })
    : null;
  observer?.observe(shell);

  return () => {
    toggle.removeEventListener('click', onToggle);
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('pointerdown', onPress, true);
    doc.removeEventListener('focusin', onFocusIn);
    observer?.disconnect();
  };
}

/**
 * From 850 up the sidebar can be folded into the 56px rail of icons and unfolded again by the button in its header
 * (`.im-sidebar-collapse`). The state is `data-im-sidebar-collapsed` on the shell, so the CSS needs no script; the app
 * stores the choice and passes it back as `collapsed` the next time. The button's label and `aria-expanded` follow the
 * state: its `data-im-label-collapse` and `data-im-label-expand` hold the two names. Under 850 the button goes with the
 * header; if it had focus, focus moves on (see the top of this file). Returns the function that removes the listener
 * and the observer.
 */
export function sidebarCollapse(shell: HTMLElement, options: { collapsed?: boolean; onChange?: (collapsed: boolean) => void } = {}): () => void {
  const button = shell.querySelector<HTMLElement>('.im-sidebar-collapse');
  const sidebar = button?.closest<HTMLElement>('.im-sidebar');
  if (!button || !sidebar) return () => {};
  const doc = shell.ownerDocument;
  const win = doc.defaultView;

  const show = (collapsed: boolean): void => {
    if (collapsed) shell.dataset.imSidebarCollapsed = 'true';
    else delete shell.dataset.imSidebarCollapsed;
    const label = (collapsed ? button.dataset.imLabelExpand : button.dataset.imLabelCollapse) ?? '';
    if (label) {
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    button.setAttribute('aria-expanded', String(!collapsed));
  };
  const onClick = (): void => {
    const collapsed = shell.dataset.imSidebarCollapsed !== 'true';
    show(collapsed);
    options.onChange?.(collapsed);
  };

  show(options.collapsed ?? shell.dataset.imSidebarCollapsed === 'true');
  button.addEventListener('click', onClick);

  let wide: boolean | null = null;
  const observer = win
    ? new win.ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width;
        if (width === undefined) return;
        const wasWide = wide;
        wide = width >= FOLD_FROM;
        if (wasWide === null || wasWide === wide || wide || doc.activeElement !== button) return;
        // the button is gone with the header: the sidebar's tab stop, or the drawer's button when no sidebar is on screen
        const toggle = shell.querySelector<HTMLElement>('.im-sidebar-toggle');
        (sidebarStop(sidebar) ?? (toggle && isRendered(toggle) ? toggle : null))?.focus();
      })
    : null;
  observer?.observe(shell);

  return () => {
    button.removeEventListener('click', onClick);
    observer?.disconnect();
  };
}
