import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { attachLayers, closeLayers, hasDialog, pushLayer, topLayer, type Layer, type LayerKind } from '../ts/ui/layers.ts';

// Plain objects stand in for elements: the module must not need a DOM.
type Fake = { inert?: boolean; contains?: (other: unknown) => boolean };
type FakeOpener = { isConnected: boolean; focused: number; focus(): void };
type Listener = (event: Record<string, unknown>) => void;

const opener = (isConnected = true): FakeOpener => ({
  isConnected,
  focused: 0,
  focus() {
    this.focused++;
  },
});

// A document that only records its listeners, so the tests can press keys on it.
function fakeShell() {
  const listeners = new Map<string, Listener>();
  const doc = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: (type: string, listener: Listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const press = (key: string, extra: Record<string, unknown> = {}) => {
    const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, stopped: false, ...extra };
    listeners.get('keydown')?.(event);
    return event as { defaultPrevented: boolean; stopped: boolean };
  };
  return { shell: { ownerDocument: doc } as unknown as HTMLElement, listeners, press };
}

// A layer whose close pops it, as the real surfaces do; `closed` counts the calls.
function fakeLayer(kind: LayerKind, from: FakeOpener | null = null) {
  const el: Fake = {};
  const state = { closed: 0, pop: () => {} };
  const layer: Layer = {
    el: el as unknown as HTMLElement,
    kind,
    close() {
      state.closed++;
      state.pop();
    },
  };
  state.pop = pushLayer(layer, from as unknown as HTMLElement | null);
  return { layer, el, state };
}

function emptyStack() {
  closeLayers(['menu', 'sheet', 'dialog', 'palette']);
  assert.equal(topLayer(), undefined);
}

test('one Escape closes only the top layer', () => {
  const { shell, press } = fakeShell();
  const detach = attachLayers(shell);
  const first = fakeLayer('sheet');
  const second = fakeLayer('menu');
  assert.equal(topLayer(), second.layer);

  const event = press('Escape');
  assert.equal(second.state.closed, 1);
  assert.equal(first.state.closed, 0);
  assert.equal(topLayer(), first.layer);
  assert.equal(event.defaultPrevented, true, 'the press is consumed');
  assert.equal(event.stopped, true, 'no other handler also acts on it');

  press('Escape');
  assert.equal(first.state.closed, 1);
  assert.equal(topLayer(), undefined);
  detach();
  emptyStack();
});

test('Escape with no layer is left alone', () => {
  const { shell, press } = fakeShell();
  const detach = attachLayers(shell);
  const event = press('Escape');
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.stopped, false);
  detach();
});

test('Escape belongs to the IME while it composes, and a held key closes one layer only', () => {
  const { shell, press } = fakeShell();
  const detach = attachLayers(shell);
  const layer = fakeLayer('palette');
  press('Escape', { isComposing: true });
  press('Escape', { keyCode: 229 });
  press('Escape', { repeat: true });
  press('Enter');
  assert.equal(layer.state.closed, 0);
  press('Escape');
  assert.equal(layer.state.closed, 1);
  detach();
  emptyStack();
});

test('popping in the wrong order does not throw and leaves the stack consistent', () => {
  const bottom = fakeLayer('sheet');
  const top = fakeLayer('menu');

  assert.doesNotThrow(() => bottom.state.pop());
  assert.equal(topLayer(), top.layer);

  assert.doesNotThrow(() => bottom.state.pop(), 'a second pop of the same layer is a no-op');
  assert.equal(topLayer(), top.layer);

  top.state.pop();
  assert.equal(topLayer(), undefined);
  assert.doesNotThrow(() => top.state.pop());
});

test('pop restores focus to the opener only when it is still in the document and the layer was on top', () => {
  const lower = opener();
  const upper = opener();
  const gone = opener(false);

  const a = fakeLayer('sheet', lower);
  const b = fakeLayer('menu', upper);
  a.state.pop();
  assert.equal(lower.focused, 0, 'a layer under another one does not take focus');
  b.state.pop();
  assert.equal(upper.focused, 1);

  const c = fakeLayer('menu', gone);
  c.state.pop();
  assert.equal(gone.focused, 0, 'an opener that left the document is not focused');
  assert.equal(topLayer(), undefined);
});

test('hasDialog is true only while a dialog is on the stack', () => {
  assert.equal(hasDialog(), false);
  const menu = fakeLayer('menu');
  assert.equal(hasDialog(), false);
  const dialog = fakeLayer('dialog');
  assert.equal(hasDialog(), true);
  dialog.state.pop();
  assert.equal(hasDialog(), false);
  menu.state.pop();
});

test('a layer under a modal one is inert; a layer above it is not', () => {
  const sheet = fakeLayer('sheet');
  assert.equal(sheet.el.inert, false);
  const dialog = fakeLayer('dialog');
  assert.equal(sheet.el.inert, true, 'under the dialog');
  assert.equal(dialog.el.inert, false);
  const menu = fakeLayer('menu');
  assert.equal(menu.el.inert, false, 'a menu opened from inside the dialog stays live');
  assert.equal(dialog.el.inert, false);
  menu.state.pop();
  dialog.state.pop();
  assert.equal(sheet.el.inert, false, 'live again once the dialog is gone');
  sheet.state.pop();
});

test('detaching closes every layer still open', () => {
  const { shell, listeners } = fakeShell();
  const detach = attachLayers(shell);
  const a = fakeLayer('sheet');
  const b = fakeLayer('dialog');
  detach();
  assert.equal(a.state.closed, 1);
  assert.equal(b.state.closed, 1);
  assert.equal(topLayer(), undefined);
  assert.equal(listeners.size, 0, 'every listener is removed');
});

// Source files that call the native modal: it makes the HTML title bar inert.
function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|mts)$/.test(name) ? [path] : [];
  });
}

test('no source file in ts/ calls showModal', () => {
  const root = fileURLToPath(new URL('../ts', import.meta.url));
  const offenders = sources(root).filter((path) => readFileSync(path, 'utf8').includes('showModal('));
  assert.deepEqual(offenders, []);
});
