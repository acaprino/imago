// A sheet: a short choice or a small form docked to the control or the pane it belongs to. It is not
// modal and one is open at a time. Escape and a press outside close it; focus goes back to the control.
// While it is open it follows its anchor, which moves with splitters, the sidebar and window resizes.

import { closeLayers, follow, hasLayer, hasModal, topLayer, nameOf, placeBelow, pushLayer, shellOf, tabbables, trapTab, type Layer } from './layers.ts';

export type SheetPlacement = 'below' | 'pane-top' | 'pane-bottom';

const EDGE = 8;
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(value, Math.max(low, high)));

// `below` hangs the sheet under the anchor. `pane-top` and `pane-bottom` take the anchor to be a pane:
// the sheet sits at its top, centred and at most 620 wide, or fills the bottom of its width. A narrow
// pane cannot hold the sheet, which then overhangs the pane and stays inside the window.
function place(shell: HTMLElement, anchor: HTMLElement, sheet: HTMLElement, placement: SheetPlacement): void {
  if (placement === 'below') {
    placeBelow(shell, anchor, sheet, 6);
    return;
  }
  const box = shell.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const style = sheet.style;
  if (placement === 'pane-top') {
    const width = Math.min(box.width - EDGE * 2, Math.max(360, Math.min(at.width - 24, 620)));
    const top = at.top - box.top;
    style.width = `${Math.round(width)}px`;
    style.left = `${Math.round(clamp(at.left - box.left + (at.width - width) / 2, EDGE, box.width - width - EDGE))}px`;
    style.top = `${Math.round(top)}px`;
    style.bottom = 'auto';
    style.maxHeight = `${Math.round(Math.max(260, box.height - top - 36))}px`;
  } else {
    const width = Math.max(240, at.width);
    style.width = `${Math.round(width)}px`;
    style.left = `${Math.round(clamp(at.left - box.left, 0, box.width - width))}px`;
    style.top = 'auto';
    style.bottom = `${Math.round(Math.max(0, box.bottom - at.bottom))}px`;
    style.maxHeight = `${Math.round(Math.max(120, at.height))}px`;
  }
}

/** Opens a sheet holding `content`, docked to `anchor`. Opening one closes the open one. Returns the function that closes it. */
export function openSheet(anchor: HTMLElement, content: HTMLElement, options: { placement?: SheetPlacement; onClose?: () => void } = {}): () => void {
  const placement = options.placement ?? 'below';
  const doc = anchor.ownerDocument;
  const shell = shellOf(anchor);
  closeLayers(['sheet']);
  if (hasLayer('sheet')) return () => {};

  const sheet = doc.createElement('div');
  sheet.className = 'im-float im-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.tabIndex = -1;
  sheet.dataset.imLayer = 'sheet';
  const name = nameOf(anchor);
  if (name) sheet.setAttribute('aria-label', name);
  sheet.append(content);

  // Under a control, the control toggles the sheet. Docked to a pane, the anchor is the whole pane: not a control, so
  // it says nothing about being expanded, and a press in it, outside the sheet, closes the sheet and still reaches
  // what was pressed.
  const toggling = placement === 'below';
  const expandedBefore = anchor.getAttribute('aria-expanded');

  let open = true;
  let pop = (): void => {};
  let stopFollowing = (): void => {};

  function close(): void {
    if (!open) return;
    open = false;
    stopFollowing();
    // The control gets back what the page wrote on it: its own aria-expanded, or none.
    if (toggling) {
      if (expandedBefore === null) anchor.removeAttribute('aria-expanded');
      else anchor.setAttribute('aria-expanded', expandedBefore);
    }
    pop();
    sheet.remove();
    options.onClose?.();
  }

  // The sheet is not modal, but Tab stays inside it: Escape is the way out, and focus then returns to the control.
  sheet.addEventListener('keydown', (event) => trapTab(event, sheet));

  shell.append(sheet);
  place(shell, anchor, sheet, placement);
  const layer: Layer = { el: sheet, kind: 'sheet', toggles: toggling, close };
  // Focus goes back to the opener on close. Under a control that is the control. A pane takes no focus, so a sheet
  // docked to one goes back to what had focus when it opened (read after the sheet it replaced has given focus back).
  const focused = doc.activeElement as HTMLElement | null;
  const opener = toggling ? anchor : focused && focused !== doc.body ? focused : null;
  pop = pushLayer(layer, opener);
  if (toggling) anchor.setAttribute('aria-expanded', 'true');
  stopFollowing = follow(() => {
    if (!anchor.isConnected) close(); // the control it hangs from is gone: nothing left to dock to
    else place(shell, anchor, sheet, placement);
  });
  (tabbables(sheet)[0] ?? sheet).focus();
  return close;
}
/** Dock a native form sheet while retaining its native close/cancel event contract.
 * The owner may refuse cancellation during a save. */
export function openDialogSheet(dialog: HTMLDialogElement, options: {
  anchor: () => HTMLElement | null;
  placement: SheetPlacement;
  lightDismiss?: () => boolean;
}): boolean {
  if (hasModal()) return false;
  if (dialog.open) return topLayer()?.el === dialog;
  closeLayers(['sheet', 'menu']);
  if (hasLayer('sheet')) return false;
  const target = options.anchor();
  if (!target) return false;
  const anchor: HTMLElement = target;
  const shell = shellOf(anchor);
  const focused = dialog.ownerDocument.activeElement;
  const opener = options.placement === 'below' ? anchor : focused instanceof HTMLElement ? focused : null;
  const expanded = anchor.getAttribute('aria-expanded');
  const cancel = () => {
    if (dialog.open && dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    if (!dialog.open) release();
  };
  dialog.classList.add('im-float', 'im-sheet', 'im-form-sheet');
  dialog.dataset.imLayer = 'sheet';
  dialog.dataset.sheet = options.placement;
  dialog.removeAttribute('aria-modal');
  dialog.removeAttribute('data-covered');
  if (options.placement === 'below') anchor.setAttribute('aria-expanded', 'true');
  shell.append(dialog);
  dialog.show();
  const position = () => place(shell, options.anchor() ?? anchor, dialog, options.placement);
  position();
  const stop = follow(position);
  const pop = pushLayer({ el: dialog, kind: 'sheet', close: cancel, toggles: options.placement === 'below',
    lightDismiss: options.lightDismiss, acceptsEscape: target => target instanceof Node && dialog.contains(target),
    dispose: () => { dialog.close(); release(); } }, opener);
  const observed = new MutationObserver(() => { if (!dialog.open) release(); });
  observed.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  function release() {
    observed.disconnect();
    if (options.placement === 'below') {
      if (expanded === null) anchor.removeAttribute('aria-expanded');
      else anchor.setAttribute('aria-expanded', expanded);
    }
    stop();
    pop();
    delete dialog.dataset.imLayer;
    delete dialog.dataset.sheet;
    for (const property of ['left','top','bottom','width','max-height']) dialog.style.removeProperty(property);
    dialog.classList.remove('im-float', 'im-sheet', 'im-form-sheet');
  }
  return true;
}
