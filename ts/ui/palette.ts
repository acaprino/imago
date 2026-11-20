// The command palette: every available command of the app's registry, filtered as the user types.
// Opened with Ctrl+K from the app's own command. Arrows move the highlight, Enter runs it and closes the
// palette, Escape closes it. Like the dialog it is modal: the regions under the title bar are inert.

import type { Command, Registry } from './commands.ts';
import { nextIndex } from './keys.ts';
import { closeLayers, hasDialog, inertShell, pushLayer, type Layer } from './layers.ts';
import { keyCaps } from './menu.ts';

export type PaletteOptions = { placeholder?: string; empty?: string };

const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>';

let counter = 0;
let closeOpen: (() => void) | null = null;

// Every word typed must appear in the group or the title, in any order, ignoring case.
function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter((command) => {
    const text = `${command.group ?? ''} ${command.title}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/**
 * Opens the palette over the shell. Does nothing while a dialog is open (a decision comes first) and
 * while a palette is already open. Returns the function that closes it.
 */
export function openPalette(shell: HTMLElement, registry: Registry, options: PaletteOptions = {}): () => void {
  if (hasDialog()) return () => {};
  if (closeOpen) return closeOpen;

  closeLayers(['menu', 'sheet']); // the palette takes the user somewhere else: a menu or sheet would be left behind
  const doc = shell.ownerDocument;
  const active = doc.activeElement;
  const opener = active instanceof HTMLElement && active !== doc.body ? active : null;
  const id = `im-palette-${++counter}`;
  const placeholder = options.placeholder ?? 'Type a command';

  const scrim = doc.createElement('div');
  scrim.className = 'im-scrim im-scrim--top';
  scrim.dataset.imLayer = 'palette';

  const palette = doc.createElement('div');
  palette.className = 'im-float im-palette';
  palette.setAttribute('role', 'dialog');
  palette.setAttribute('aria-modal', 'true');
  palette.setAttribute('aria-label', placeholder);

  const field = doc.createElement('label');
  field.className = 'im-palette-field';
  field.insertAdjacentHTML('beforeend', SEARCH);
  const input = doc.createElement('input');
  input.type = 'text';
  input.className = 'im-palette-input';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', placeholder);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', `${id}-list`);
  field.append(input);

  const list = doc.createElement('div');
  list.id = `${id}-list`;
  list.className = 'im-palette-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', placeholder);

  const empty = doc.createElement('div');
  empty.className = 'im-palette-empty';
  empty.setAttribute('aria-live', 'polite');
  empty.hidden = true;

  palette.append(field, list, empty);
  scrim.append(palette);

  let shown: Command[] = [];
  let highlighted = 0;
  let done = false;
  let release = (): void => {};
  let pop = (): void => {};

  function close(): void {
    if (done) return;
    done = true;
    closeOpen = null;
    release();
    pop();
    scrim.remove();
  }

  function mark(): void {
    const rows = Array.from(list.children);
    rows.forEach((row, index) => row.setAttribute('aria-selected', String(index === highlighted)));
    const current = rows[highlighted];
    if (current) {
      input.setAttribute('aria-activedescendant', current.id);
      // Scroll the list only: scrollIntoView could also move the shell's clipped ancestors.
      const at = current.getBoundingClientRect();
      const view = list.getBoundingClientRect();
      if (at.top < view.top) list.scrollTop -= view.top - at.top;
      else if (at.bottom > view.bottom) list.scrollTop += at.bottom - view.bottom;
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  // The palette is closed before the command runs. A command that fails, by throwing or by rejecting, is the
  // app's to report: it must not become an unhandled rejection, and the palette is already gone either way.
  function run(command: Command): void {
    close();
    const failed = (error: unknown): void => console.warn(`Command "${command.id}" failed`, error);
    try {
      void Promise.resolve(command.run()).catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  function draw(): void {
    shown = filterCommands(registry.list(), input.value);
    highlighted = Math.min(highlighted, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((command, index) => {
        const option = doc.createElement('div');
        option.id = `${id}-option-${index}`;
        option.className = 'im-menu-item';
        option.setAttribute('role', 'option');
        const label = doc.createElement('span');
        label.textContent = command.title;
        option.append(label);
        if (command.keys) option.append(keyCaps(doc, command.keys));
        return option;
      }),
    );
    list.hidden = shown.length === 0;
    input.setAttribute('aria-expanded', String(shown.length > 0));
    empty.hidden = shown.length > 0;
    empty.textContent = shown.length ? '' : (options.empty ?? 'No command matches');
    mark();
  }

  const optionAt = (target: EventTarget | null): number =>
    target instanceof Element ? Array.from(list.children).indexOf(target.closest('.im-menu-item') as Element) : -1;

  // Listing the commands calls every `when()`, which is the app's code: if one throws, the palette closes
  // cleanly (the page is released, focus goes back) and the error goes on.
  function redraw(): void {
    try {
      draw();
    } catch (error) {
      close();
      throw error;
    }
  }

  input.addEventListener('input', () => {
    highlighted = 0;
    redraw();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = nextIndex(highlighted, shown.length, event.key, 'vertical');
      if (next !== -1) highlighted = next;
      mark();
    } else if (event.key === 'Enter') {
      if (event.isComposing || event.keyCode === 229) return; // Enter belongs to the IME while it composes
      event.preventDefault();
      const command = shown[highlighted];
      if (command) run(command);
    } else if (event.key === 'Tab') {
      event.preventDefault(); // focus stays in the field; the list is reached with the arrows
    }
  });
  list.addEventListener('mousedown', (event) => event.preventDefault()); // keep focus in the field
  list.addEventListener('click', (event) => {
    const command = shown[optionAt(event.target)];
    if (command) run(command);
  });
  list.addEventListener('pointermove', (event) => {
    const index = optionAt(event.target);
    if (index !== -1 && index !== highlighted) {
      highlighted = index;
      mark();
    }
  });
  // A press on the page behind the palette closes it, as a press outside closes a menu.
  scrim.addEventListener('mousedown', (event) => {
    if (event.target !== scrim) return;
    event.preventDefault();
    close();
  });

  release = inertShell(shell);
  shell.append(scrim);
  const layer: Layer = { el: scrim, kind: 'palette', close };
  pop = pushLayer(layer, opener);
  closeOpen = close;
  redraw();
  input.focus();
  return close;
}
