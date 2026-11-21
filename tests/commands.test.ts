import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRegistry, formatKeys, isTextTarget } from '../ts/ui/commands.ts';
import type { Command, KeyEventLike } from '../ts/ui/commands.ts';
import { claimKey } from '../ts/ui/key-claim.ts';
import { pushLayer, type LayerKind } from '../ts/ui/layers.ts';

const press = (key: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...extra,
});

const command = (id: string, keys?: string, extra: Partial<Command> = {}): Command => ({
  id,
  title: id,
  keys,
  run: () => {},
  ...extra,
});

const input = { tagName: 'INPUT', isContentEditable: false };

test('match finds Ctrl+K and Ctrl+Shift+T and not Ctrl+T', () => {
  const registry = createRegistry();
  registry.register(command('palette', 'Ctrl+K'));
  registry.register(command('reopen', 'Ctrl+Shift+T'));

  assert.equal(registry.match(press('k', { ctrlKey: true }))?.id, 'palette');
  assert.equal(registry.match(press('K', { ctrlKey: true }))?.id, 'palette');
  assert.equal(registry.match(press('T', { ctrlKey: true, shiftKey: true }))?.id, 'reopen');
  assert.equal(registry.match(press('t', { ctrlKey: true })), undefined);
  assert.equal(registry.match(press('k')), undefined);
  assert.equal(registry.match(press('k', { ctrlKey: true, altKey: true })), undefined);
  assert.equal(registry.match(press('k', { ctrlKey: true, metaKey: true })), undefined);
});

test('a single-letter binding does not match in a text target and does elsewhere', () => {
  const registry = createRegistry();
  registry.register(command('add', 'a'));

  assert.equal(registry.match(press('a', { target: input }))?.id, undefined);
  assert.equal(registry.match(press('a', { target: { tagName: 'TEXTAREA' } })), undefined);
  assert.equal(registry.match(press('a', { target: { tagName: 'DIV', isContentEditable: true } })), undefined);
  assert.equal(registry.match(press('a', { target: { tagName: 'BUTTON', isContentEditable: false } }))?.id, 'add');
  assert.equal(registry.match(press('a', { target: undefined }))?.id, 'add');
  assert.equal(registry.match(press('a'))?.id, 'add');
});

test('a binding with Ctrl does match inside a text target', () => {
  const registry = createRegistry();
  registry.register(command('palette', 'Ctrl+K'));
  assert.equal(registry.match(press('k', { ctrlKey: true, target: input }))?.id, 'palette');
});

test('Escape and the function keys match inside a text target', () => {
  const registry = createRegistry();
  registry.register(command('close', 'Escape'));
  registry.register(command('next-pane', 'F6'));
  assert.equal(registry.match(press('Escape', { target: input }))?.id, 'close');
  assert.equal(registry.match(press('F6', { target: input }))?.id, 'next-pane');
});

test('a key that edits text (Delete, Backspace, Home, End, the arrows, Enter, Tab) is left to a text target', () => {
  const registry = createRegistry();
  const names = ['Delete', 'Backspace', 'Home', 'End', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'Enter', 'Tab'];
  for (const name of names) registry.register(command(name, name));

  for (const name of names) {
    assert.equal(registry.match(press(name, { target: input }))?.id, undefined, `${name} in an input`);
    assert.equal(registry.match(press(name, { target: { tagName: 'TEXTAREA' } }))?.id, undefined, `${name} in a textarea`);
    assert.equal(registry.match(press(name, { target: { tagName: 'DIV', isContentEditable: true } }))?.id, undefined, `${name} in an editable`);
    assert.equal(registry.match(press(name, { target: { tagName: 'BUTTON' } }))?.id, name, `${name} on a button`);
    assert.equal(registry.match(press(name))?.id, name, `${name} without a target`);
  }
});

test('Shift with such a key does not bring it into a text target either', () => {
  const registry = createRegistry();
  registry.register(command('cut-line', 'Shift+Delete'));
  registry.register(command('select-line', 'Shift+ArrowDown'));
  assert.equal(registry.match(press('Delete', { shiftKey: true, target: input })), undefined);
  assert.equal(registry.match(press('ArrowDown', { shiftKey: true, target: input })), undefined);
  assert.equal(registry.match(press('Delete', { shiftKey: true }))?.id, 'cut-line');
});

test('a binding with Ctrl or Alt matches inside a text target, whatever its key', () => {
  const registry = createRegistry();
  registry.register(command('palette', 'Ctrl+K'));
  registry.register(command('purge', 'Ctrl+Delete'));
  registry.register(command('home', 'Alt+Home'));
  registry.register(command('up', 'Ctrl+Shift+ArrowUp'));
  assert.equal(registry.match(press('k', { ctrlKey: true, target: input }))?.id, 'palette');
  assert.equal(registry.match(press('Delete', { ctrlKey: true, target: input }))?.id, 'purge');
  assert.equal(registry.match(press('Home', { altKey: true, target: input }))?.id, 'home');
  assert.equal(registry.match(press('ArrowUp', { ctrlKey: true, shiftKey: true, target: input }))?.id, 'up');
});

test('Escape and every function key F1 to F24 match inside a text target', () => {
  const registry = createRegistry();
  registry.register(command('close', 'Escape'));
  registry.register(command('shifted', 'Shift+F6'));
  for (let number = 1; number <= 24; number++) registry.register(command(`f${number}`, `F${number}`));

  assert.equal(registry.match(press('Escape', { target: input }))?.id, 'close');
  assert.equal(registry.match(press('F6', { shiftKey: true, target: input }))?.id, 'shifted');
  for (let number = 1; number <= 24; number++) {
    assert.equal(registry.match(press(`F${number}`, { target: input }))?.id, `f${number}`, `F${number}`);
  }
});

test('a word that only starts like a function key is not one', () => {
  const registry = createRegistry();
  registry.register(command('fn', 'Fn'));
  registry.register(command('f25', 'F25'));
  registry.register(command('f0', 'F0'));
  for (const name of ['Fn', 'F25', 'F0']) {
    assert.equal(registry.match(press(name, { target: input })), undefined, name);
  }
});

test('Enter does not match while an IME composes', () => {
  const registry = createRegistry();
  registry.register(command('confirm', 'Enter'));

  assert.equal(registry.match(press('Enter'))?.id, 'confirm');
  assert.equal(registry.match(press('Enter', { isComposing: true })), undefined);
  assert.equal(registry.match(press('Enter', { keyCode: 229 })), undefined);
  assert.equal(registry.match(press('Enter', { isComposing: false, keyCode: 13 }))?.id, 'confirm');
});

test('a command whose when() is false is hidden from list() and match()', () => {
  const registry = createRegistry();
  let enabled = false;
  registry.register(command('save', 'Ctrl+S', { when: () => enabled }));
  registry.register(command('open', 'Ctrl+O'));

  assert.deepEqual(registry.list().map((c) => c.id), ['open']);
  assert.equal(registry.match(press('s', { ctrlKey: true })), undefined);

  enabled = true;
  assert.deepEqual(registry.list().map((c) => c.id), ['save', 'open']);
  assert.equal(registry.match(press('s', { ctrlKey: true }))?.id, 'save');
});

test('get returns a command by id, also while when() hides it', () => {
  const registry = createRegistry();
  const hidden = command('hidden', undefined, { when: () => false });
  registry.register(hidden);
  assert.equal(registry.get('hidden'), hidden);
  assert.equal(registry.get('missing'), undefined);
});

test('a duplicate id throws and leaves the first command in place', () => {
  const registry = createRegistry();
  const first = command('save', 'Ctrl+S');
  registry.register(first);
  assert.throws(() => registry.register(command('save', 'Ctrl+Shift+S')), /save/);
  assert.equal(registry.get('save'), first);
  assert.equal(registry.match(press('s', { ctrlKey: true, shiftKey: true })), undefined);
});

test('two commands with the same keys throw at register', () => {
  const registry = createRegistry();
  registry.register(command('palette', 'Ctrl+K'));
  registry.register(command('reopen', 'Ctrl+Shift+T'));
  assert.throws(() => registry.register(command('other', 'Ctrl+K')), /Ctrl\+K/);
  assert.throws(() => registry.register(command('other', 'ctrl+k')), /ctrl\+k/);
  assert.throws(() => registry.register(command('other', 'Shift+Ctrl+T')), /Shift\+Ctrl\+T/);
  assert.equal(registry.get('other'), undefined);
});

test('the same keys may differ by modifier and commands without keys never clash', () => {
  const registry = createRegistry();
  registry.register(command('a', 'Ctrl+K'));
  registry.register(command('b', 'Ctrl+Shift+K'));
  registry.register(command('c'));
  registry.register(command('d'));
  assert.deepEqual(registry.list().map((c) => c.id), ['a', 'b', 'c', 'd']);
});

test('keys that cannot match anything throw at register', () => {
  const registry = createRegistry();
  for (const keys of ['', 'Ctrl+', 'Ctrl', 'Ctrl-K', 'Ctrl+K+L', 'Ctrl+Shift']) {
    assert.throws(() => registry.register(command(`bad ${keys}`, keys)), /keys/, keys);
  }
  assert.deepEqual(registry.list(), []);
});

test('the key names of the grammar match', () => {
  const registry = createRegistry();
  registry.register(command('zoom-in', 'Ctrl+='));
  registry.register(command('plus', 'Ctrl++'));
  registry.register(command('pick', 'Space'));
  registry.register(command('up', 'ArrowUp'));

  assert.equal(registry.match(press('=', { ctrlKey: true }))?.id, 'zoom-in');
  assert.equal(registry.match(press('+', { ctrlKey: true }))?.id, 'plus');
  assert.equal(registry.match(press(' '))?.id, 'pick');
  assert.equal(registry.match(press('ArrowUp'))?.id, 'up');
});

test('unregister removes the command, frees its id and keys, and is safe to call twice', () => {
  const registry = createRegistry();
  const unregister = registry.register(command('palette', 'Ctrl+K'));
  unregister();
  assert.equal(registry.get('palette'), undefined);
  assert.equal(registry.match(press('k', { ctrlKey: true })), undefined);

  const second = command('palette', 'Ctrl+K');
  registry.register(second);
  unregister();
  assert.equal(registry.get('palette'), second, 'a stale unregister must not remove its successor');
  assert.equal(registry.match(press('k', { ctrlKey: true })), second);
});

const fakeTarget = () => {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    listeners,
    addEventListener: (type: string, listener: (event: unknown) => void) => void listeners.set(type, listener),
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch: (type: string, event: unknown) => listeners.get(type)?.(event),
  };
};

test('attach runs a matching command once and prevents the default action', () => {
  const registry = createRegistry();
  let runs = 0;
  registry.register(command('palette', 'Ctrl+K', { run: () => void runs++ }));
  const target = fakeTarget();
  registry.attach(target);

  let prevented = 0;
  target.dispatch('keydown', { ...press('k', { ctrlKey: true }), preventDefault: () => void prevented++ });
  assert.equal(runs, 1);
  assert.equal(prevented, 1);

  target.dispatch('keydown', { ...press('x', { ctrlKey: true }), preventDefault: () => void prevented++ });
  assert.equal(runs, 1);
  assert.equal(prevented, 1, 'an event that matches nothing keeps its default action');
});

test('attach runs no command for a key a handler of the package claimed, and leaves that key as it is', () => {
  const registry = createRegistry();
  let runs = 0;
  registry.register(command('clear', 'Escape', { run: () => void runs++ }));
  const target = fakeTarget();
  registry.attach(target);

  // Escape that closed the inspector, the sidebar drawer or a layer: the handler that answered it claimed it.
  let prevented = 0;
  const taken = { ...press('Escape'), defaultPrevented: true, preventDefault: () => void prevented++ };
  claimKey(taken);
  target.dispatch('keydown', taken);
  assert.equal(runs, 0, 'a key is answered once, by the handler that claimed it');
  assert.equal(prevented, 0);

  target.dispatch('keydown', { ...press('Escape'), defaultPrevented: false, preventDefault: () => void prevented++ });
  assert.equal(runs, 1, 'an Escape that nothing claimed runs the command');
  assert.equal(prevented, 1);
});

test('a key that a handler only prevented, and did not claim, still runs its command: guardDesktop refuses Ctrl+F to the browser, not to the app', () => {
  const registry = createRegistry();
  let runs = 0;
  registry.register(command('search', 'Ctrl+F', { run: () => void runs++ }));
  const target = fakeTarget();
  registry.attach(target);

  let prevented = 0;
  target.dispatch('keydown', { ...press('f', { ctrlKey: true }), defaultPrevented: true, preventDefault: () => void prevented++ });
  assert.equal(runs, 1, 'the command runs');
  assert.equal(prevented, 1, 'and the key stays cancelled');
});

// What a failing command leaves behind: the warnings it wrote and the rejections nobody handled.
async function pressAndWatch(run: () => void | Promise<void>): Promise<{ warnings: unknown[][]; unhandled: unknown[] }> {
  const registry = createRegistry();
  registry.register(command('flaky', 'Ctrl+K', { run }));
  const target = fakeTarget();
  registry.attach(target);

  const warnings: unknown[][] = [];
  const unhandled: unknown[] = [];
  const warn = console.warn;
  const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
  console.warn = (...args: unknown[]): void => void warnings.push(args);
  process.on('unhandledRejection', onUnhandled);
  try {
    target.dispatch('keydown', { ...press('k', { ctrlKey: true }), preventDefault: () => {} });
    await new Promise((done) => setTimeout(done, 20)); // the rejection is reported once the microtasks have run
  } finally {
    process.off('unhandledRejection', onUnhandled);
    console.warn = warn;
  }
  return { warnings, unhandled };
}

test('attach reports a command that rejects as a warning, not as an unhandled rejection', async () => {
  const failure = new Error('disk full');
  const { warnings, unhandled } = await pressAndWatch(() => Promise.reject(failure));
  assert.deepEqual(unhandled, []);
  assert.deepEqual(warnings, [['Command "flaky" failed', failure]]);
});

test('attach reports a command that throws as a warning too, and a command that succeeds says nothing', async () => {
  const failure = new Error('bad state');
  const thrown = await pressAndWatch(() => {
    throw failure;
  });
  assert.deepEqual(thrown.warnings, [['Command "flaky" failed', failure]]);

  const fine = await pressAndWatch(async () => {});
  assert.deepEqual(fine, { warnings: [], unhandled: [] });
});

test('attach listens to keydown only and the returned detach removes the listener', () => {
  const registry = createRegistry();
  registry.register(command('palette', 'Ctrl+K'));
  const target = fakeTarget();
  const detach = registry.attach(target);
  assert.deepEqual([...target.listeners.keys()], ['keydown']);
  detach();
  assert.equal(target.listeners.size, 0);
});

// A layer of this kind on the stack, as a surface would push it. Returns the function that removes it.
const openLayer = (kind: LayerKind): (() => void) => {
  let pop = (): void => {};
  pop = pushLayer({ el: {} as unknown as HTMLElement, kind, close: () => pop() }, null);
  return pop;
};

// Presses Ctrl+K on a registry attached to a fake target; says whether the command ran and the key was cancelled.
const pressK = (options?: { runUnderModal?: boolean }, open: LayerKind[] = []) => {
  const registry = createRegistry();
  let runs = 0;
  registry.register(command('palette', 'Ctrl+K', { run: () => void runs++ }));
  const target = fakeTarget();
  const detach = registry.attach(target, options);
  const pops = open.map(openLayer);
  let prevented = 0;
  target.dispatch('keydown', { ...press('k', { ctrlKey: true }), preventDefault: () => void prevented++ });
  pops.forEach((pop) => pop());
  detach();
  return { runs, prevented };
};

test('attach does not run a command under an open dialog or palette, and leaves the key alone', () => {
  assert.deepEqual(pressK(undefined, ['dialog']), { runs: 0, prevented: 0 });
  assert.deepEqual(pressK(undefined, ['palette']), { runs: 0, prevented: 0 });
  assert.deepEqual(pressK(undefined, ['menu', 'dialog']), { runs: 0, prevented: 0 });
});

test('attach still runs a command under a menu or a sheet, which are not modal', () => {
  assert.deepEqual(pressK(undefined, ['menu']), { runs: 1, prevented: 1 });
  assert.deepEqual(pressK(undefined, ['sheet']), { runs: 1, prevented: 1 });
  assert.deepEqual(pressK(), { runs: 1, prevented: 1 });
});

test('attach runs commands again once the modal layer has closed', () => {
  const registry = createRegistry();
  let runs = 0;
  registry.register(command('palette', 'Ctrl+K', { run: () => void runs++ }));
  const target = fakeTarget();
  registry.attach(target);
  const key = () => target.dispatch('keydown', { ...press('k', { ctrlKey: true }), preventDefault: () => {} });

  const close = openLayer('dialog');
  key();
  assert.equal(runs, 0);
  close();
  key();
  assert.equal(runs, 1);
});

test('attach with runUnderModal runs commands under a dialog too', () => {
  assert.deepEqual(pressK({ runUnderModal: true }, ['dialog']), { runs: 1, prevented: 1 });
  assert.deepEqual(pressK({ runUnderModal: true }, ['palette']), { runs: 1, prevented: 1 });
  assert.deepEqual(pressK({ runUnderModal: false }, ['dialog']), { runs: 0, prevented: 0 });
});

test('match does not look at the layers: it answers for the key alone', () => {
  const registry = createRegistry();
  registry.register(command('palette', 'Ctrl+K'));
  const close = openLayer('dialog');
  assert.equal(registry.match(press('k', { ctrlKey: true }))?.id, 'palette');
  close();
});

test('commands.ts may import layers.ts: layers.ts imports only key-claim.ts, which imports nothing, so there is no cycle', () => {
  const imports = (file: string): string[] =>
    [...readFileSync(new URL(`../ts/ui/${file}`, import.meta.url), 'utf8').matchAll(/^\s*(?:import|export)\b.*\bfrom\s+['"]([^'"]+)['"]/gm)].map((found) => found[1]);
  assert.deepEqual(imports('layers.ts'), ['./key-claim.ts']);
  assert.deepEqual(imports('key-claim.ts'), []);
});

test('isTextTarget is true for input, textarea, select and contenteditable only', () => {
  assert.equal(isTextTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextTarget({ tagName: 'input' }), true);
  assert.equal(isTextTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTextTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextTarget({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(isTextTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTextTarget({}), false);
  assert.equal(isTextTarget(null), false);
  assert.equal(isTextTarget(undefined), false);
  assert.equal(isTextTarget('input'), false);
});

test('formatKeys turns a binding into key caps', () => {
  assert.deepEqual(formatKeys('Ctrl+Shift+T'), ['Ctrl', '⇧', 'T']);
  assert.deepEqual(formatKeys('Enter'), ['↵']);
  assert.deepEqual(formatKeys('Escape'), ['Esc']);
  assert.deepEqual(formatKeys('Space'), ['Space']);
  assert.deepEqual(formatKeys('Alt+ArrowUp'), ['Alt', '↑']);
  assert.deepEqual(formatKeys('ArrowDown'), ['↓']);
  assert.deepEqual(formatKeys('ArrowLeft'), ['←']);
  assert.deepEqual(formatKeys('ArrowRight'), ['→']);
  assert.deepEqual(formatKeys('a'), ['A']);
  assert.deepEqual(formatKeys('ctrl+k'), ['Ctrl', 'K']);
  assert.deepEqual(formatKeys('Ctrl+='), ['Ctrl', '=']);
  assert.deepEqual(formatKeys('F6'), ['F6']);
  assert.deepEqual(formatKeys('Shift+Ctrl+Alt+Delete'), ['Ctrl', '⇧', 'Alt', 'Delete']);
});
