// A menu: a few commands under the control that opened it. The arrows move through it, Enter and
// Space run the item, Tab and Escape close it, and focus goes back to the control.

import { formatKeys } from './commands.ts';
import { roving } from './keys.ts';
import { closeLayers, nameOf, placeBelow, pushLayer, shellOf, type Layer } from './layers.ts';

export type MenuItem =
  | {
      label: string;
      keys?: string;
      /** The reason the item is not available. The item stays visible and explains itself in its tooltip. */
      disabled?: string;
      danger?: boolean;
      run: () => void;
    }
  | 'separator';

/** The key caps of a binding, as `<kbd class="im-key">` elements in one span. */
export function keyCaps(doc: Document, keys: string): HTMLElement {
  const caps = doc.createElement('span');
  caps.className = 'im-keys';
  for (const key of formatKeys(keys)) {
    const cap = doc.createElement('kbd');
    cap.className = 'im-key';
    cap.textContent = key;
    caps.append(cap);
  }
  return caps;
}

/** Opens a menu under `anchor`. Returns the function that closes it. */
export function openMenu(anchor: HTMLElement, items: MenuItem[]): () => void {
  const doc = anchor.ownerDocument;
  const shell = shellOf(anchor);
  closeLayers(['menu']); // one menu at a time

  const menu = doc.createElement('div');
  menu.className = 'im-float im-menu';
  menu.setAttribute('role', 'menu');
  menu.dataset.imLayer = 'menu';
  const name = nameOf(anchor);
  if (name) menu.setAttribute('aria-label', name);

  const runs = new Map<HTMLElement, () => void>();
  for (const item of items) {
    if (item === 'separator') {
      const rule = doc.createElement('hr');
      rule.className = 'im-menu-sep';
      menu.append(rule);
      continue;
    }
    const row = doc.createElement('button');
    row.type = 'button';
    row.className = 'im-menu-item';
    row.setAttribute('role', 'menuitem');
    const label = doc.createElement('span');
    label.textContent = item.label;
    row.append(label);
    if (item.keys) row.append(keyCaps(doc, item.keys));
    if (item.danger) row.dataset.imTone = 'danger';
    if (item.disabled !== undefined) {
      row.setAttribute('aria-disabled', 'true');
      row.title = item.disabled;
    } else {
      runs.set(row, item.run);
    }
    menu.append(row);
  }

  let open = true;
  let pop = (): void => {};
  let stopRoving = (): void => {};

  // Closes first, so the command that runs finds the page as the menu left it: focus back on the anchor.
  function close(): void {
    if (!open) return;
    open = false;
    stopRoving();
    anchor.setAttribute('aria-expanded', 'false');
    pop();
    menu.remove();
  }

  function activate(row: HTMLElement): void {
    const run = runs.get(row);
    if (!run) return; // a disabled item is not run
    close();
    run();
  }

  menu.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('.im-menu-item') : null;
    if (row) activate(row);
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') close(); // Tab leaves the menu; the browser then moves on from the anchor
  });

  shell.append(menu);
  placeBelow(shell, anchor, menu);
  const layer: Layer = { el: menu, kind: 'menu', close };
  pop = pushLayer(layer, anchor);
  anchor.setAttribute('aria-haspopup', 'menu');
  anchor.setAttribute('aria-expanded', 'true');
  stopRoving = roving(menu, { item: '.im-menu-item', orientation: 'vertical', onSelect: activate });
  Array.from(menu.querySelectorAll<HTMLElement>('.im-menu-item')).find((row) => runs.has(row))?.focus();
  return close;
}
