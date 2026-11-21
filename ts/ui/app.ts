// What every app does the same way, in one place: the layer stack, the keys, the regions, the sidebar, and the two
// commands that every app has, `Ctrl+K` for the palette and `Ctrl+F` for the search of the view. An app calls
// `mountApp` once for its shell and cannot forget one of those calls. Nothing is touched when this module is imported.

import type { Registry } from './commands.ts';
import { regions } from './keys.ts';
import { attachLayers, hasLayer } from './layers.ts';
import { keyCaps } from './menu.ts';
import { openPalette } from './palette.ts';
import { sidebarCollapse, sidebarDrawer } from './sidebar.ts';

/** The id of the command that opens the palette, in every app. Its keys are `Ctrl+K`. */
export const PALETTE_COMMAND = 'imago.palette';
/** The id of the command that searches the current view, in every app. Its keys are `Ctrl+F`. */
export const SEARCH_COMMAND = 'imago.search';

/** The words of the two commands. The package's own are English: an app in another language gives its own. */
export interface StandardLabels {
  /** The title of the palette command. Default `Commands`. */
  palette: string;
  /** The title of the search command. Default `Search in this view`. */
  search: string;
  /** The placeholder of the palette's field. Left out, the palette's own. */
  palettePlaceholder?: string;
  /** What the palette says when no command matches. Left out, the palette's own. */
  paletteEmpty?: string;
}

const DEFAULT_LABELS = { palette: 'Commands', search: 'Search in this view' };

// Runs the functions, the last one first. One that throws does not keep the others from running: the first error is
// thrown once all have run.
function undoAll(undo: readonly (() => void)[]): void {
  const failures: unknown[] = [];
  for (const step of [...undo].reverse()) {
    try {
      step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw failures[0];
}

/**
 * Registers `Ctrl+K`, which opens the palette over `shell`, and `Ctrl+F`, which calls `options.search`, under the ids
 * `PALETTE_COMMAND` and `SEARCH_COMMAND`. The titles are the labels, so the palette lists them in the app's words.
 * The palette command is not offered while the palette is open, so the palette does not list itself.
 *
 * An app that registered either id, or bound either key, has made an error: the registry throws as it does for any
 * duplicate, and what this call had registered by then is unregistered again. Returns the function that unregisters both.
 */
export function standardCommands(
  registry: Registry,
  shell: HTMLElement,
  options: { search: () => void; labels?: Partial<StandardLabels> },
): () => void {
  const labels = options.labels;
  const undo: Array<() => void> = [];
  try {
    // One push for each register: when the second throws, the first must already be in `undo`.
    undo.push(
      registry.register({
        id: PALETTE_COMMAND,
        title: labels?.palette ?? DEFAULT_LABELS.palette,
        keys: 'Ctrl+K',
        when: () => !hasLayer('palette'),
        run: () => void openPalette(shell, registry, { placeholder: labels?.palettePlaceholder, empty: labels?.paletteEmpty }),
      }),
    );
    undo.push(
      registry.register({
        id: SEARCH_COMMAND,
        title: labels?.search ?? DEFAULT_LABELS.search,
        keys: 'Ctrl+F',
        run: () => options.search(),
      }),
    );
  } catch (error) {
    undoAll(undo);
    throw error;
  }
  return () => undoAll(undo);
}

/**
 * The key list of a footer, from the registry: for each id that is registered and has keys, its key caps and its title,
 * `<span><kbd class="im-key">F6</kbd>Next region</span>`, in the order of `ids`. An id that is not registered, or has no
 * keys, is left out. The caps are those of `keyCaps`. A command that `when()` hides now is still listed: the footer is
 * written, not watched, so the app writes it again when its commands change.
 */
export function footerKeys(doc: Document, registry: Registry, ids: readonly string[]): HTMLElement {
  const list = doc.createElement('span');
  list.className = 'im-footer-keys';
  for (const id of ids) {
    const command = registry.get(id);
    if (!command?.keys) continue;
    const item = doc.createElement('span');
    item.append(...Array.from(keyCaps(doc, command.keys).children), command.title);
    list.append(item);
  }
  return list;
}

export interface AppOptions {
  /** Called on `Ctrl+F`: move focus to the search of the current view. */
  search: () => void;
  labels?: Partial<StandardLabels>;
  /**
   * The fold of the sidebar: `collapsed` is the choice the app kept, `onChange` tells it the new one. The package does
   * not store it. Read only when the shell has a sidebar.
   */
  sidebar?: { collapsed?: boolean; onChange?: (collapsed: boolean) => void };
}

const mounted = new WeakSet<HTMLElement>();

/**
 * The calls every app makes, in one: `attachLayers(shell)`, `registry.attach` on the shell's document, `regions(shell)`,
 * `sidebarDrawer(shell)` and `sidebarCollapse(shell, options.sidebar)` when the shell has a sidebar (`.im-sidebar`, at
 * the time of this call), and `standardCommands`. Register the app's own commands before or after: the registry keeps
 * them in the order they come, and the palette lists them so.
 *
 * Call it once for each shell: a second call on a shell that is still mounted throws. If a step throws (the app
 * already registered `Ctrl+K`, say), the steps before it are undone and the error is thrown, so the shell is free to be
 * mounted again. Returns the function that undoes every step in reverse order, closes the surfaces still open and
 * frees the shell; calling it again does nothing.
 */
export function mountApp(shell: HTMLElement, registry: Registry, options: AppOptions): () => void {
  if (mounted.has(shell)) throw new Error('mountApp: this shell is already mounted; call the function it returned before mounting it again');

  const undo: Array<() => void> = [];
  try {
    undo.push(attachLayers(shell));
    undo.push(registry.attach(shell.ownerDocument));
    undo.push(regions(shell));
    if (shell.querySelector('.im-sidebar')) {
      undo.push(sidebarDrawer(shell));
      undo.push(sidebarCollapse(shell, options.sidebar));
    }
    undo.push(standardCommands(registry, shell, options));
  } catch (error) {
    try {
      undoAll(undo);
    } catch {
      // The step that failed is the error that matters.
    }
    throw error;
  }

  mounted.add(shell);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try {
      undoAll(undo);
    } finally {
      mounted.delete(shell);
    }
  };
}
