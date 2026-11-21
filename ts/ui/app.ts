// What every app does the same way, in one place: the layer stack, the keys, the regions, the sidebar, the two
// commands that every app has, `Ctrl+K` for the palette and `Ctrl+F` for the search of the view, and the five that pick
// the look and the theme. An app calls `mountApp` once for its shell and cannot forget one of those calls. Nothing is
// touched when this module is imported.

// Types only: the ui entry does not load the shell entry (ts/tauri.ts takes WindowApi the same way).
import type { Look, ThemeChoice } from '../shell/look.ts';
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

/** The ids of the five commands that pick the look and the theme, in every app (`AppOptions.appearance`). No key is bound. */
export const LOOK_SMOOTH = 'imago.look.smooth';
export const LOOK_ONI = 'imago.look.oni';
export const THEME_SYSTEM = 'imago.theme.system';
export const THEME_LIGHT = 'imago.theme.light';
export const THEME_DARK = 'imago.theme.dark';

/**
 * How the user picks the look and the theme, alike in every app: five commands of the palette. The app keeps the
 * choice (where it stores it is its own business) and puts it on the window with `applyLook`; the package stores
 * nothing. `get` gives the choice now, `set` is called with the new one.
 */
export interface AppearanceOptions {
  get: () => { look: Look; theme: ThemeChoice };
  set: (next: { look: Look; theme: ThemeChoice }) => void;
  /**
   * The words of the commands. Left out, the package's own: the group `Appearance`, and `Smooth look`, `ONI look`,
   * `Follow Windows`, `Light theme`, `Dark theme`.
   */
  labels?: Partial<Record<'smooth' | 'oni' | 'system' | 'light' | 'dark' | 'group', string>>;
}

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
 * One entry of a footer's key list: the id of a command, or a key of a list that is not a command (the arrows, Space,
 * Enter) with its title. `keys` is in the grammar of a command's keys; several bindings are separated by a space
 * (`ArrowUp ArrowDown`).
 */
export type FooterEntry = string | { keys: string; title: string };

/**
 * The key list of a footer, from the registry: for each id that is registered and has keys, its key caps and its title,
 * `<span><kbd class="im-key">F6</kbd>Next region</span>`, and for each `{ keys, title }` those keys and that title, in
 * the order of `entries`. An entry with no keys (an id that is not registered, a command without keys) is left out;
 * keys that cannot match throw. The caps are those of `keyCaps`. A command that `when()` hides now is still listed:
 * the footer is written, not watched, so the app writes it again when its commands change.
 */
export function footerKeys(doc: Document, registry: Registry, entries: readonly FooterEntry[]): HTMLElement {
  const list = doc.createElement('span');
  list.className = 'im-footer-keys';
  for (const entry of entries) {
    const found = typeof entry === 'string' ? registry.get(entry) : entry;
    if (!found?.keys) continue;
    const item = doc.createElement('span');
    for (const binding of found.keys.trim().split(/\s+/)) item.append(...Array.from(keyCaps(doc, binding).children));
    item.append(found.title);
    list.append(item);
  }
  return list;
}

const DEFAULT_APPEARANCE = { group: 'Appearance', smooth: 'Smooth look', oni: 'ONI look', system: 'Follow Windows', light: 'Light theme', dark: 'Dark theme' };

/**
 * Registers the five commands of `appearance` in its group: each calls `set` with its own half and the other half of
 * `get()` unchanged, and the command of the current choice is not available. Returns the function that unregisters them.
 */
function appearanceCommands(registry: Registry, appearance: AppearanceOptions): () => void {
  const { get, set, labels } = appearance;
  const group = labels?.group ?? DEFAULT_APPEARANCE.group;
  const looks = [[LOOK_SMOOTH, 'smooth'], [LOOK_ONI, 'oni']] as const;
  const themes = [[THEME_SYSTEM, 'system'], [THEME_LIGHT, 'light'], [THEME_DARK, 'dark']] as const;
  const undo: Array<() => void> = [];
  try {
    for (const [id, look] of looks) {
      undo.push(registry.register({ id, title: labels?.[look] ?? DEFAULT_APPEARANCE[look], group, when: () => get().look !== look, run: () => set({ look, theme: get().theme }) }));
    }
    for (const [id, theme] of themes) {
      undo.push(registry.register({ id, title: labels?.[theme] ?? DEFAULT_APPEARANCE[theme], group, when: () => get().theme !== theme, run: () => set({ look: get().look, theme }) }));
    }
  } catch (error) {
    undoAll(undo);
    throw error;
  }
  return () => undoAll(undo);
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
  /** The look and the theme: with it, the five commands `LOOK_SMOOTH` to `THEME_DARK` are registered. */
  appearance?: AppearanceOptions;
}

const mounted = new WeakSet<HTMLElement>();

// An error of mountApp says so first. The registry's own message stays whole after it: it names the id, or the keys
// and the command of the app that holds them, that is in the way.
function mountError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith('mountApp: ') && error instanceof Error ? error : new Error(`mountApp: ${message}`, { cause: error });
}

/**
 * The calls every app makes, in one: `attachLayers(shell)`, `sidebarDrawer(shell)` and `sidebarCollapse(shell,
 * options.sidebar)` when the shell has a sidebar (`.im-sidebar`, at the time of this call), `registry.attach` on the
 * shell's document, `regions(shell)`, `standardCommands`, and with `options.appearance` the five commands of the look
 * and the theme. Register the app's own commands before or after: the registry keeps them in the order they come, and
 * the palette lists them so.
 *
 * A key is answered once. The layers and the sidebar drawer listen before the registry: an Escape that closes one of
 * them (or the inspector, which listens on its own region) runs no command of the app.
 *
 * Call it once for each shell: a second call on a shell that is still mounted throws. If a step throws (the app
 * already registered `Ctrl+K`, say), the steps before it are undone and the error is thrown, so the shell is free to be
 * mounted again. Every error starts with `mountApp: `; one caused by an id or a key the app registered itself names
 * it. Returns the function that undoes every step in reverse order, closes the surfaces still open and frees the
 * shell; calling it again does nothing.
 */
export function mountApp(shell: HTMLElement, registry: Registry, options: AppOptions): () => void {
  if (mounted.has(shell)) throw new Error('mountApp: this shell is already mounted; call the function it returned before mounting it again');
  const { appearance } = options;
  if (appearance && (typeof appearance.get !== 'function' || typeof appearance.set !== 'function')) {
    throw new Error('mountApp: appearance needs get and set, the two functions that read and write the choice the app keeps');
  }

  const undo: Array<() => void> = [];
  try {
    undo.push(attachLayers(shell));
    if (shell.querySelector('.im-sidebar')) {
      undo.push(sidebarDrawer(shell));
      undo.push(sidebarCollapse(shell, options.sidebar));
    }
    undo.push(registry.attach(shell.ownerDocument));
    undo.push(regions(shell));
    undo.push(standardCommands(registry, shell, options));
    if (appearance) undo.push(appearanceCommands(registry, appearance));
  } catch (error) {
    try {
      undoAll(undo);
    } catch {
      // The step that failed is the error that matters.
    }
    throw mountError(error);
  }

  mounted.add(shell);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try {
      undoAll(undo);
    } catch (error) {
      throw mountError(error);
    } finally {
      mounted.delete(shell);
    }
  };
}
