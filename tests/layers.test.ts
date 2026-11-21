import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { attachLayers, closeLayers, hasDialog, hasModal, pushLayer, topLayer, topLayerOf, type Layer, type LayerKind } from '../ts/ui/layers.ts';

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
  // Fires a recorded event; `stopped` tells whether a handler consumed it.
  const fire = (type: string, extra: Record<string, unknown> = {}) => {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, stopped: false, ...extra };
    listeners.get(type)?.(event);
    return event as { defaultPrevented: boolean; stopped: boolean };
  };
  const press = (key: string, extra: Record<string, unknown> = {}) => fire('keydown', { key, ...extra });
  return { shell: { ownerDocument: doc } as unknown as HTMLElement, listeners, press, fire };
}

// A layer whose close pops it, as the real surfaces do; `closed` counts the calls.
function fakeLayer(kind: LayerKind, from: FakeOpener | null = null, made: { el?: unknown; toggles?: boolean; acceptsEscape?: Layer['acceptsEscape'] } = {}) {
  const el: Fake = (made.el as Fake | undefined) ?? {};
  const state = { closed: 0, pop: () => {} };
  const layer: Layer = {
    el: el as unknown as HTMLElement,
    kind,
    toggles: made.toggles,
    acceptsEscape: made.acceptsEscape,
    close() {
      state.closed++;
      state.pop();
    },
  };
  state.pop = pushLayer(layer, from as unknown as HTMLElement | null);
  return { layer, el, state };
}

function emptyStack() {
  closeLayers(['menu', 'sheet', 'drawer', 'dialog', 'palette']);
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

// A small tree of fake nodes, so that a press has a target inside a control, inside a layer, or outside both.
class FakeNode {
  children: FakeNode[] = [];
  parent: FakeNode | null;
  constructor(parent: FakeNode | null = null) {
    this.parent = parent;
    parent?.children.push(this);
  }
  get parentElement() {
    return this.parent;
  }
  contains(other: unknown): boolean {
    return other === this || this.children.some((child) => child.contains(other));
  }
  closest() {
    return null;
  }
}
class FakeElement extends FakeNode {}

// `layers.ts` reads `Node` and `Element` when a press arrives: stand-ins for the two, taken away afterwards.
async function withFakeDom(run: () => Promise<void> | void) {
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = { Node: globals.Node, Element: globals.Element };
  globals.Node = FakeNode;
  globals.Element = FakeElement;
  try {
    await run();
  } finally {
    globals.Node = saved.Node;
    globals.Element = saved.Element;
  }
}

function parts() {
  const root = new FakeElement();
  const control = new FakeElement(root);
  return { control, inControl: new FakeElement(control), layerEl: new FakeElement(root), elsewhere: new FakeElement(root) };
}

// The control is the layer's opener; the tests pass the fake as the element it stands for.
const asOpener = (node: FakeNode) => node as unknown as FakeOpener;

test('a press on a control that toggles its layer closes it and swallows the click that follows', async () => {
  await withFakeDom(() => {
    const { shell, fire } = fakeShell();
    const detach = attachLayers(shell);
    const { control, inControl, layerEl } = parts();
    const menu = fakeLayer('menu', asOpener(control), { el: layerEl, toggles: true });
    fire('pointerdown', { target: inControl });
    assert.equal(menu.state.closed, 1, 'the press closed the menu');
    assert.equal(fire('click', { target: inControl }).stopped, true, 'the click on the control is swallowed');
    assert.equal(fire('click', { target: inControl }).stopped, false, 'and only that one click');
    detach();
  });
});

test('a press in a pane that a sheet is docked to closes the sheet and still reaches what was pressed', async () => {
  await withFakeDom(() => {
    const { shell, fire } = fakeShell();
    const detach = attachLayers(shell);
    const { control, inControl, layerEl } = parts();
    // The anchor is the whole pane: the layer does not toggle.
    const sheet = fakeLayer('sheet', asOpener(control), { el: layerEl });
    fire('pointerdown', { target: inControl });
    assert.equal(sheet.state.closed, 1, 'a press in the pane closes the sheet');
    const click = fire('click', { target: inControl });
    assert.equal(click.stopped, false, 'the click is not swallowed');
    assert.equal(click.defaultPrevented, false);
    detach();
  });
});

test('a press inside the layer keeps it, and a press elsewhere closes it without swallowing the click', async () => {
  await withFakeDom(() => {
    const { shell, fire } = fakeShell();
    const detach = attachLayers(shell);
    const { control, layerEl, elsewhere } = parts();
    const inside = new FakeElement(layerEl);
    const menu = fakeLayer('menu', asOpener(control), { el: layerEl, toggles: true });
    fire('pointerdown', { target: inside });
    assert.equal(menu.state.closed, 0, 'a press inside keeps the menu');
    fire('pointerdown', { target: elsewhere });
    assert.equal(menu.state.closed, 1, 'a press elsewhere closes it');
    assert.equal(fire('click', { target: elsewhere }).stopped, false, 'and the click is not swallowed');
    detach();
  });
});

test('a press that never clicks does not leave the next click on the control to be swallowed', async () => {
  await withFakeDom(async () => {
    const { shell, fire } = fakeShell();
    const detach = attachLayers(shell);

    // Pressed and released with no click after it: the keyboard clicks the control later.
    const first = parts();
    fakeLayer('menu', asOpener(first.control), { el: first.layerEl, toggles: true });
    fire('pointerdown', { target: first.inControl });
    fire('pointerup', { target: first.inControl });
    await new Promise((done) => setTimeout(done, 5));
    assert.equal(fire('click', { target: first.inControl }).stopped, false, 'after a release the swallow is gone');

    // A key press in between does the same.
    const second = parts();
    fakeLayer('menu', asOpener(second.control), { el: second.layerEl, toggles: true });
    fire('pointerdown', { target: second.inControl });
    fire('keydown', { key: 'Enter' });
    assert.equal(fire('click', { target: second.inControl }).stopped, false, 'after a key press the swallow is gone');

    // The ordinary order still swallows: the click comes right after the release.
    const third = parts();
    fakeLayer('menu', asOpener(third.control), { el: third.layerEl, toggles: true });
    fire('pointerdown', { target: third.inControl });
    fire('pointerup', { target: third.inControl });
    assert.equal(fire('click', { target: third.inControl }).stopped, true, 'a click right after the release is swallowed');
    detach();
  });
});

test('a modal layer makes the notice hosts inert, and its removal gives them back', () => {
  const hosts = [{ inert: false }, { inert: false }];
  const doc = { querySelectorAll: () => hosts };
  const sheet = fakeLayer('sheet', null, { el: { ownerDocument: doc } });
  assert.equal(hasModal(), false);
  assert.deepEqual(hosts.map((host) => host.inert), [false, false], 'a sheet leaves the notices alone');
  const dialog = fakeLayer('dialog', null, { el: { ownerDocument: doc } });
  assert.equal(hasModal(), true);
  assert.deepEqual(hosts.map((host) => host.inert), [true, true], 'a dialog makes them inert');
  const palette = fakeLayer('palette');
  dialog.state.pop();
  assert.deepEqual(hosts.map((host) => host.inert), [true, true], 'still inert under the palette');
  palette.state.pop();
  assert.deepEqual(hosts.map((host) => host.inert), [false, false], 'live again when no modal layer is left');
  assert.equal(hasModal(), false);
  sheet.state.pop();
});

// A fake element that records the attributes the stack toggles on it.
const marked = () => {
  const attributes = new Set<string>();
  return { attributes, inert: false, toggleAttribute(name: string, on: boolean) { if (on) attributes.add(name); else attributes.delete(name); } };
};

test('a drawer under another drawer is covered; a menu over a drawer leaves it live', () => {
  const lower = fakeLayer('drawer', null, { el: marked() });
  const upper = fakeLayer('drawer', null, { el: marked() });
  const covered = (layer: typeof lower) => (layer.el as ReturnType<typeof marked>).attributes.has('data-im-covered');
  assert.equal(lower.el.inert, true, 'the lower drawer cannot be reached');
  assert.equal(covered(lower), true, 'and is taken off the screen');
  assert.equal(upper.el.inert, false);
  assert.equal(covered(upper), false);
  const menu = fakeLayer('menu');
  assert.equal(upper.el.inert, false, 'a menu over the top drawer leaves it live');
  assert.equal(covered(upper), false);
  menu.state.pop();
  upper.state.pop();
  assert.equal(lower.el.inert, false, 'uncovered when the drawer over it closes');
  assert.equal(covered(lower), false);
  const dialog = fakeLayer('dialog');
  assert.equal(lower.el.inert, true, 'a dialog makes the drawer under it inert');
  dialog.state.pop();
  lower.state.pop();
  emptyStack();
});

test('topLayerOf finds the highest layer of the kinds asked, under a menu or a sheet', () => {
  const drawer = fakeLayer('drawer');
  const sheet = fakeLayer('sheet');
  const menu = fakeLayer('menu');
  assert.equal(topLayer(), menu.layer);
  assert.equal(topLayerOf(['drawer', 'dialog']), drawer.layer);
  assert.equal(topLayerOf(['palette']), undefined);
  emptyStack();
  assert.equal(topLayerOf(['drawer']), undefined);
  void sheet;
});

test('Escape closes the top drawer unless the focused target keeps Escape', () => {
  const { shell, press } = fakeShell();
  const detach = attachLayers(shell);
  const terminal = { inTerminal: true };
  const drawer = fakeLayer('drawer', null, { acceptsEscape: (target) => target !== (terminal as unknown as EventTarget) });
  const kept = press('Escape', { target: terminal });
  assert.equal(drawer.state.closed, 0, 'the terminal keeps its Escape');
  assert.equal(kept.defaultPrevented, false, 'and the press reaches it');
  press('Escape', { target: {} });
  assert.equal(drawer.state.closed, 1, 'anywhere else Escape closes the drawer');
  detach();
  emptyStack();
});

test('a press beside a drawer leaves it open; its control closes it, with the drawers over it, and swallows the click', async () => {
  await withFakeDom(() => {
    const { shell, fire } = fakeShell();
    const detach = attachLayers(shell);
    const { control, inControl, layerEl, elsewhere } = parts();
    const lower = fakeLayer('drawer', asOpener(control), { el: layerEl, toggles: true });
    const inLower = new FakeElement(layerEl);
    const upper = fakeLayer('drawer', asOpener(inLower), { el: new FakeElement(), toggles: true });
    fire('pointerdown', { target: elsewhere });
    assert.equal(lower.state.closed + upper.state.closed, 0, 'a press in the panels beside it keeps every drawer');
    assert.equal(fire('click', { target: elsewhere }).stopped, false, 'and reaches what was pressed');
    fire('pointerdown', { target: inControl });
    assert.equal(lower.state.closed + upper.state.closed, 0, 'a press is not yet the click');
    assert.equal(fire('click', { target: inControl }).stopped, true, 'the click on the control is taken');
    assert.equal(upper.state.closed, 1, 'the control of the lower drawer closes the drawer over it');
    assert.equal(lower.state.closed, 1, 'and its own');
    detach();
    emptyStack();
  });
});

test('a click on the control of an open drawer from the keyboard closes it too', async () => {
  await withFakeDom(() => {
    const { shell, fire } = fakeShell();
    const detach = attachLayers(shell);
    const { control, layerEl } = parts();
    const drawer = fakeLayer('drawer', asOpener(control), { el: layerEl, toggles: true });
    fire('keydown', { key: 'Enter', target: control });
    assert.equal(fire('click', { target: control }).stopped, true, 'the click is taken');
    assert.equal(drawer.state.closed, 1, 'and the drawer is closed');
    detach();
    emptyStack();
  });
});

test('a sheet over a drawer closes on a press outside it, and the drawer stays', async () => {
  await withFakeDom(() => {
    const { shell, fire } = fakeShell();
    const detach = attachLayers(shell);
    const { control, layerEl, elsewhere } = parts();
    const drawer = fakeLayer('drawer', asOpener(control), { el: layerEl, toggles: true });
    const sheet = fakeLayer('sheet', null, { el: new FakeElement() });
    fire('pointerdown', { target: elsewhere });
    assert.equal(sheet.state.closed, 1, 'the sheet closes');
    assert.equal(drawer.state.closed, 0, 'the drawer under it stays');
    detach();
    emptyStack();
  });
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
