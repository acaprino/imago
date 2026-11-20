// Below 620 the sidebar is not in the layout: a title-bar button (`.im-sidebar-toggle`) opens it as an overlay from the
// left edge (CSS: `[data-im-sidebar-open="true"]` on the shell). The object list of an app must stay reachable at the
// minimum window width and at 200% zoom, by keyboard and by pointer.
//
// Opening moves focus into the sidebar. A second click on the button, Escape from inside the sidebar, or a press outside
// it closes it and gives focus back to the button. Widening the shell to 620 or more clears the open state: the
// sidebar is then a column or a rail again.

const WIDE_FROM = 620;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const inside = (node: EventTarget | null): boolean => node instanceof Node && (sidebar.contains(node) || toggle.contains(node));

  const open = (): void => {
    show(true);
    const target = sidebar.querySelector<HTMLElement>('[tabindex="0"]') ?? sidebar.querySelector<HTMLElement>(FOCUSABLE);
    if (target) target.focus();
    else {
      // nothing in it takes focus: the sidebar itself does, so that Escape and Tab start from inside it
      sidebar.tabIndex = -1;
      sidebar.focus();
    }
  };
  const close = (): void => {
    show(false);
    toggle.focus();
  };

  const onToggle = (): void => (isOpen() ? close() : open());
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOpen() || !inside(event.target)) return;
    event.preventDefault();
    close();
  };
  const onPress = (event: Event): void => {
    if (!isOpen() || inside(event.target)) return;
    show(false);
    // The press puts focus where it landed. When that is nowhere (the page, or the sidebar that just went away),
    // focus goes back to the button instead of being lost.
    win?.setTimeout(() => {
      const active = doc.activeElement;
      if (!active || active === doc.body || sidebar.contains(active)) toggle.focus();
    }, 0);
  };

  toggle.addEventListener('click', onToggle);
  shell.addEventListener('keydown', onKey);
  doc.addEventListener('pointerdown', onPress, true);

  const observer = win ? new win.ResizeObserver((entries) => {
    const width = entries[entries.length - 1]?.contentRect.width ?? WIDE_FROM;
    if (width >= WIDE_FROM && isOpen()) show(false);
  }) : null;
  observer?.observe(shell);

  return () => {
    toggle.removeEventListener('click', onToggle);
    shell.removeEventListener('keydown', onKey);
    doc.removeEventListener('pointerdown', onPress, true);
    observer?.disconnect();
  };
}
