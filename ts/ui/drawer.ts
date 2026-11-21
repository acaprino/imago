// A drawer: an app-owned native form beside the panels, under the title bar at the window's edge. It is not
// modal: the panels stay live, and a press in them leaves it open. Escape closes the top drawer, the control that
// opened one closes it again, and opening one from outside the open drawers replaces them. A drawer opened from
// inside another covers it: the covered one keeps its DOM and scroll, cannot be reached, and comes back when the
// one over it closes. Every drawer is a layer of the one stack, so a menu or a sheet opened over a drawer closes
// first, and a dialog makes the drawers under it inert.

import { closeLayers, hasModal, pushLayer, shellOf, topLayer, type Layer } from './layers.ts';

export interface DialogDrawerOptions {
  /** The control that opened the drawer: it toggles the drawer and gets focus back. By default, what had focus. */
  opener?: HTMLElement | null;
  /** Escape belongs to the focused target when this says `false` (a terminal that reads Escape itself). */
  acceptsEscape?: (target: EventTarget | null) => boolean;
}

const DRAWER_CLASSES = ['im-float', 'im-dialog', 'im-content-drawer'];
const openDrawers = new Set<HTMLDialogElement>();

/** Ask an open drawer to close, as its own Cancel would: an app that refuses the native `cancel` event keeps it. */
function cancel(dialog: HTMLDialogElement): void {
  if (dialog.open && dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
}

/**
 * Shows an app-owned `<dialog>` as a drawer and puts it on the layer stack. Returns `false` when a dialog or the
 * palette is open (a drawer never opens under a modal layer), and whether it is the top layer when it is already
 * open. Closing it natively (`dialog.close()`, `method="dialog"`, its `cancel`) releases the layer.
 */
export function openDialogDrawer(dialog: HTMLDialogElement, options: DialogDrawerOptions = {}): boolean {
  if (hasModal()) return false;
  if (dialog.open) return topLayer()?.el === dialog;
  const doc = dialog.ownerDocument;
  const focused = doc.activeElement instanceof HTMLElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  const opener = options.opener === undefined ? focused : options.opener;
  closeLayers(['menu', 'sheet']);
  // From inside the top drawer the new one covers it; from anywhere else it replaces every open drawer.
  const top = topLayer();
  const nested = top?.kind === 'drawer' && focused !== null && top.el.contains(focused);
  if (!nested) for (const open of [...openDrawers].reverse()) cancel(open);

  // Only the classes the drawer adds go when it closes: the app's own stay.
  const added = DRAWER_CLASSES.filter((name) => !dialog.classList.contains(name));
  dialog.classList.add(...added);
  dialog.dataset.imLayer = 'drawer';
  dialog.removeAttribute('aria-modal');
  dialog.show();
  openDrawers.add(dialog);
  const layer: Layer = {
    el: dialog, kind: 'drawer', toggles: true, acceptsEscape: options.acceptsEscape,
    close: () => cancel(dialog),
    dispose: () => { dialog.close(); release(); },
  };
  const pop = pushLayer(layer, opener);
  const shell = shellOf(dialog);
  makeRoom(shell);
  const observed = new MutationObserver(() => { if (!dialog.open) release(); });
  observed.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  // The room follows the drawer's width (a narrow window, a drawer whose content changes its size).
  const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => makeRoom(shell));
  resized?.observe(dialog);
  let released = false;
  function release(): void {
    if (released) return;
    released = true;
    observed.disconnect();
    resized?.disconnect();
    openDrawers.delete(dialog);
    pop();
    delete dialog.dataset.imLayer;
    dialog.removeAttribute('data-im-covered');
    dialog.inert = false;
    dialog.classList.remove(...added);
    makeRoom(shell);
  }
  return true;
}

/** A drawer sits beside the panels: the shell says how wide the shown drawer is (`data-im-drawer-open` and
 * `--im-drawer-width`), and from 900px its work area gives it that room; narrower, the drawer overlaps it. */
function makeRoom(shell: HTMLElement): void {
  const shown = [...openDrawers].filter((open) => open.open && !open.hasAttribute('data-im-covered') && shellOf(open) === shell);
  const width = Math.max(0, ...shown.map((open) => open.getBoundingClientRect().width));
  if (width > 0) {
    shell.dataset.imDrawerOpen = '';
    shell.style.setProperty('--im-drawer-width', `${Math.round(width)}px`);
  } else {
    delete shell.dataset.imDrawerOpen;
    shell.style.removeProperty('--im-drawer-width');
  }
}
