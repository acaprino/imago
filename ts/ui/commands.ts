// The command registry: one place that knows every command of an app, its key binding, and
// whether it is available now. Key bindings, key caps, menus and the palette all read it.
// No DOM types and nothing touched at import time, so it also runs under plain Node.

import { hasModal } from './layers.ts';

export type Command = {
  id: string;
  title: string;
  /** `Ctrl`, `Shift`, `Alt` in that order, then one key name, joined by `+`: `Ctrl+K`, `F6`, `Enter`, `Ctrl+=`. */
  keys?: string;
  group?: string;
  /** The command is available unless this returns false. */
  when?: () => boolean;
  run: () => void | Promise<void>;
};

export type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  target?: unknown;
};

type KeyDownEvent = KeyEventLike & { preventDefault(): void };

/** Anything that dispatches `keydown`: `document`, `window`, an element. */
export type KeyEventTarget = {
  addEventListener(type: 'keydown', listener: (event: KeyDownEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyDownEvent) => void): void;
};

export type AttachOptions = {
  /**
   * By default no command runs while a dialog or the palette is open: the key belongs to that surface, and a
   * command behind a pending confirmation must not act. Set this for an app that wants its commands to run anyway.
   */
  runUnderModal?: boolean;
};

export type Registry = {
  /** Returns the unregister function. Throws on a duplicate id, on keys already bound, and on keys that cannot match. */
  register(command: Command): () => void;
  /** The registered commands whose `when()` is not false, in registration order. */
  list(): Command[];
  /** A command by id, whether or not its `when()` allows it now. */
  get(id: string): Command | undefined;
  /** The available command bound to this key event. */
  match(event: KeyEventLike): Command | undefined;
  /**
   * Runs the matching command on `keydown` and cancels the browser's own action, except while a dialog or the
   * palette is open (see `AttachOptions`). Returns detach.
   */
  attach(target: KeyEventTarget, options?: AttachOptions): () => void;
};

type Chord = { ctrl: boolean; shift: boolean; alt: boolean; name: string };

const MODIFIER = /^(ctrl|shift|alt)\+(.+)$/i;
// One character (including `+`, `=`) or a word starting with a letter (`F6`, `Enter`, `ArrowUp`).
const KEY_NAME = /^(?:\S|[A-Za-z][A-Za-z0-9]+)$/u;
const MODIFIER_NAME = /^(?:ctrl|shift|alt)$/i;

function parseKeys(keys: string): Chord {
  const chord: Chord = { ctrl: false, shift: false, alt: false, name: keys };
  for (let found = MODIFIER.exec(chord.name); found; found = MODIFIER.exec(chord.name)) {
    chord[found[1].toLowerCase() as 'ctrl' | 'shift' | 'alt'] = true;
    chord.name = found[2];
  }
  if (!KEY_NAME.test(chord.name) || MODIFIER_NAME.test(chord.name)) {
    throw new Error(`Invalid keys "${keys}": expected modifiers Ctrl, Shift, Alt then one key name, joined by "+"`);
  }
  return chord;
}

// The browser reports the space bar as " ", the grammar calls it Space.
const keyName = (key: string): string => (key === ' ' ? 'space' : key.toLowerCase());

const chordId = (chord: Chord): string =>
  `${chord.ctrl ? 'ctrl+' : ''}${chord.shift ? 'shift+' : ''}${chord.alt ? 'alt+' : ''}${keyName(chord.name)}`;

// A text field owns every key pressed without Ctrl or Alt: the ones that type (`a`, `Shift+A`, `=`, Space) and the ones
// that edit or move in it (Delete, Backspace, Home, End, the arrows, Enter, Tab). A binding of such a key must not
// run in a field, and must not cancel the key there. Escape and F1 to F24 never type or edit: they stay available.
const FIELD_FREE_KEY = /^(?:escape|f(?:[1-9]|1\d|2[0-4]))$/i;
const belongsToField = (chord: Chord): boolean => !chord.ctrl && !chord.alt && !FIELD_FREE_KEY.test(chord.name);

export function isTextTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const { tagName, isContentEditable } = target as { tagName?: unknown; isContentEditable?: unknown };
  if (isContentEditable === true) return true;
  return typeof tagName === 'string' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName.toUpperCase());
}

type Entry = { command: Command; belongsToField: boolean };

export function createRegistry(): Registry {
  const byId = new Map<string, Entry>();
  const byChord = new Map<string, Entry>();
  const available = (command: Command): boolean => command.when?.() !== false;

  const match = (event: KeyEventLike): Command | undefined => {
    // A key pressed while an IME composes belongs to the IME (229 is the legacy "Process" keyCode).
    if (event.isComposing || event.keyCode === 229 || event.metaKey) return undefined;
    const id = chordId({ ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, name: event.key });
    const entry = byChord.get(id);
    if (!entry || !available(entry.command)) return undefined;
    if (entry.belongsToField && isTextTarget(event.target)) return undefined;
    return entry.command;
  };

  return {
    register(command) {
      if (byId.has(command.id)) throw new Error(`Command "${command.id}" is already registered`);
      const chord = command.keys === undefined ? undefined : parseKeys(command.keys);
      const id = chord && chordId(chord);
      if (id !== undefined) {
        const taken = byChord.get(id);
        if (taken) throw new Error(`Keys "${command.keys}" of "${command.id}" are already bound to "${taken.command.id}"`);
      }
      const entry: Entry = { command, belongsToField: chord ? belongsToField(chord) : false };
      byId.set(command.id, entry);
      if (id !== undefined) byChord.set(id, entry);
      return () => {
        // A stale unregister must not remove a later command that reuses the id.
        if (byId.get(command.id) !== entry) return;
        byId.delete(command.id);
        if (id !== undefined) byChord.delete(id);
      };
    },
    list: () => [...byId.values()].map((entry) => entry.command).filter(available),
    get: (id) => byId.get(id)?.command,
    match,
    attach(target, options = {}) {
      const onKeyDown = (event: KeyDownEvent): void => {
        if (!options.runUnderModal && hasModal()) return;
        const command = match(event);
        if (!command) return;
        event.preventDefault();
        // Reporting a failure is the app's job; it must not become an unhandled rejection (the palette does the same).
        const failed = (error: unknown): void => console.warn(`Command "${command.id}" failed`, error);
        try {
          void Promise.resolve(command.run()).catch(failed);
        } catch (error) {
          failed(error);
        }
      };
      target.addEventListener('keydown', onKeyDown);
      return () => target.removeEventListener('keydown', onKeyDown);
    },
  };
}

const SYMBOLS: Record<string, string> = {
  shift: '⇧',
  enter: '↵',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  space: 'Space',
};

/** The key caps of a binding: `Ctrl+Shift+T` becomes `["Ctrl", "⇧", "T"]`. */
export function formatKeys(keys: string): string[] {
  const chord = parseKeys(keys);
  const name = keyName(chord.name);
  const caps = [chord.ctrl && 'Ctrl', chord.shift && SYMBOLS.shift, chord.alt && 'Alt'].filter(Boolean) as string[];
  caps.push(SYMBOLS[name] ?? ([...chord.name].length === 1 ? chord.name.toUpperCase() : chord.name));
  return caps;
}
