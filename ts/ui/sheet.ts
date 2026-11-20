// A sheet: a short choice or a small form docked to the control or the pane it belongs to. It is not
// modal and one is open at a time. Escape and a press outside close it; focus goes back to the control.
// While it is open it follows its anchor, which moves with splitters, the sidebar and window resizes.

import { closeLayers, follow, nameOf, placeBelow, pushLayer, shellOf, tabbables, trapTab, type Layer } from './layers.ts';

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
export function openSheet(anchor: HTMLElement, content: HTMLElement, options: { placement?: SheetPlacement } = {}): () => void {
  const placement = options.placement ?? 'below';
  const doc = anchor.ownerDocument;
  const shell = shellOf(anchor);
  closeLayers(['sheet']);

  const sheet = doc.createElement('div');
  sheet.className = 'im-float im-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.tabIndex = -1;
  sheet.dataset.imLayer = 'sheet';
  const name = nameOf(anchor);
  if (name) sheet.setAttribute('aria-label', name);
  sheet.append(content);

  let open = true;
  let pop = (): void => {};
  let stopFollowing = (): void => {};

  function close(): void {
    if (!open) return;
    open = false;
    stopFollowing();
    anchor.setAttribute('aria-expanded', 'false');
    pop();
    sheet.remove();
  }

  // The sheet is not modal, but Tab stays inside it: Escape is the way out, and focus then returns to the control.
  sheet.addEventListener('keydown', (event) => trapTab(event, sheet));

  shell.append(sheet);
  place(shell, anchor, sheet, placement);
  const layer: Layer = { el: sheet, kind: 'sheet', close };
  pop = pushLayer(layer, anchor);
  anchor.setAttribute('aria-expanded', 'true');
  stopFollowing = follow(() => place(shell, anchor, sheet, placement));
  (tabbables(sheet)[0] ?? sheet).focus();
  return close;
}
