// A menu: a few commands under the control that opened it. The arrows move through it, Enter and
// Space run the item, Tab and Escape close it, and focus goes back to the control.

import { formatKeys } from './commands.ts';
import { roving } from './keys.ts';
import { closeLayers, nameOf, placeBelow, pushLayer, shellOf, type Layer } from './layers.ts';

export type MenuItem =
  | {
      label: string;
      /** An existing command button whose identity and handlers must survive responsive folding.
       * Its original DOM position, role and tab stop are restored before run(). */
      control?: HTMLButtonElement;
      keys?: string;
      /** The reason the item is not available. The item stays visible and explains itself in its tooltip. */
      disabled?: string;
      danger?: boolean;
      /** A radio item stays open while its choice changes. */
      checked?: () => boolean;
      initialFocus?: boolean;
      configure?: (row: HTMLButtonElement) => void;
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
export function openMenu(anchor: HTMLElement, items: MenuItem[], options: {
  heading?: HTMLElement;
  configure?: (menu: HTMLElement) => void;
  onClose?: () => void;
} = {}): () => void {
  const doc = anchor.ownerDocument;
  const shell = shellOf(anchor);
  closeLayers(['menu']); // one menu at a time

  const menu = doc.createElement('div');
  menu.className = 'im-float im-menu';
  menu.setAttribute('role', 'menu');
  menu.dataset.imLayer = 'menu';
  const name = nameOf(anchor);
  if (name) menu.setAttribute('aria-label', name);

  options.configure?.(menu);
  if (options.heading) menu.append(options.heading);
  const runs = new Map<HTMLElement, Exclude<MenuItem, string>>();
  const radios = new Map<HTMLElement, () => boolean>();
  const restoreButtons: (() => void)[] = [];
  const reused = new Set<HTMLElement>();
  let initialFocus: HTMLElement | undefined;
  for (const item of items) {
    if (item === 'separator') {
      const rule = doc.createElement('hr');
      rule.className = 'im-menu-sep';
      menu.append(rule);
      continue;
    }
    const row = item.control ?? doc.createElement('button');
    if (item.control) {
      reused.add(row);
      const wasMenuItem = row.classList.contains('im-menu-item');
      const home = doc.createComment('menu command');
      row.before(home);
      const previous = ['role', 'tabindex', 'aria-disabled', 'aria-checked', 'data-im-tone', 'title'].map(name => [name, row.getAttribute(name)] as const);
      restoreButtons.push(() => {
        home.replaceWith(row);
        row.classList.toggle('im-menu-item', wasMenuItem);
        for (const [name, value] of previous) {
          if (value === null) row.removeAttribute(name);
          else row.setAttribute(name, value);
        }
      });
    } else row.type = 'button';
    row.classList.add('im-menu-item');
    row.setAttribute('role', item.checked ? 'menuitemradio' : 'menuitem');
    if (item.checked) {
      radios.set(row, item.checked);
      row.setAttribute('aria-checked', String(item.checked()));
    }
    item.configure?.(row);
    const label = doc.createElement('span');
    label.textContent = item.label;
    if (!item.control) row.append(label);
    if (item.keys && !item.control) row.append(keyCaps(doc, item.keys));
    if (item.danger) row.dataset.imTone = 'danger';
    if (item.disabled !== undefined) {
      row.setAttribute('aria-disabled', 'true');
      row.title = item.disabled;
    } else {
      runs.set(row, item);
      if (item.initialFocus) initialFocus = row;
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
    for (const restore of restoreButtons) restore();
    menu.remove();
    options.onClose?.();
  }

  function activate(row: HTMLElement): void {
    const item = runs.get(row);
    if (!item) return;
    if (item.checked) {
      item.run();
      for (const [radio, checked] of radios) radio.setAttribute('aria-checked', String(checked()));
    } else {
      close();
      item.run();
    }
  }

  menu.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('.im-menu-item') : null;
    if (!row) return;
    if (reused.has(row)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    activate(row);
  }, true);
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') close(); // Tab leaves the menu; the browser then moves on from the anchor
  });

  shell.append(menu);
  placeBelow(shell, anchor, menu);
  const layer: Layer = { el: menu, kind: 'menu', toggles: true, close };
  pop = pushLayer(layer, anchor);
  anchor.setAttribute('aria-haspopup', 'menu');
  anchor.setAttribute('aria-expanded', 'true');
  stopRoving = roving(menu, { item: '.im-menu-item', orientation: 'vertical', onSelect: activate });
  (initialFocus ?? runs.keys().next().value)?.focus();
  return close;
}
