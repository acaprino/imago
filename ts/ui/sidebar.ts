// Below 620 the sidebar is not in the layout: a title-bar button (`.im-sidebar-toggle`) opens it as an overlay from the
// left edge (CSS: `[data-im-sidebar-open="true"]` on the shell). The object list of an app must stay reachable at the
// minimum window width and at 200% zoom, by keyboard and by pointer.
//
// Opening moves focus into the sidebar. A second click on the button, Escape (from anywhere), or a press outside it
// closes it and gives focus back to the button. When focus moves out of the sidebar to anything but the button, it
// closes too and leaves the focus where it went. A floating layer opened from the sidebar (a menu) is not outside.
// Widening the shell to 620 or more clears the open state: the sidebar is then a column or a rail again, and focus
// follows what the width change hides.

/** The shell is narrow below this width; the CSS says the same with `@container im-shell (width < 620px)`. */
const NARROW_BELOW = 620;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FLOATING = '[data-im-layer], [data-im-notices]';

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

  /** Focus goes to the sidebar's tab stop, else its first focusable element, else the sidebar itself. */
  const focusSidebar = (): void => {
    const target = sidebar.querySelector<HTMLElement>('[tabindex="0"]') ?? sidebar.querySelector<HTMLElement>(FOCUSABLE);
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
