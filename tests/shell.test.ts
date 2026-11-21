import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLook, parseLook, parseTheme, resolveTheme } from '../ts/shell/look.ts';
import { windowThemeFor } from '../ts/shell/window-theme.ts';
import { clampZoom, mountZoom, stepZoom, wheelPixels, zoomDirection } from '../ts/shell/zoom.ts';
import { mountWindowControls, type WindowApi } from '../ts/shell/window-controls.ts';
import { guardDesktop } from '../ts/shell/desktop-guard.ts';
import * as shell from '../ts/shell/index.ts';

// Nothing in ts/shell touches the DOM or Tauri at import time: these tests run in plain Node with stubs.

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

// ---- look and window theme ------------------------------------------------------------------------------------

test('windowThemeFor: the window theme follows the look', () => {
  assert.equal(windowThemeFor('smooth', 'light'), 'light');
  assert.equal(windowThemeFor('smooth', 'dark'), 'dark');
  assert.equal(windowThemeFor('smooth', 'system'), 'system');
  assert.equal(windowThemeFor('oni', 'light'), 'light');
  assert.equal(windowThemeFor('oni', 'dark'), 'dark');
  assert.equal(windowThemeFor('oni', 'system'), 'dark');
});

test('a stored look or theme that is unknown or corrupt falls back without throwing', () => {
  for (const bad of ['modules', '', undefined, null, 42, {}, 'ONI', ['oni']]) {
    assert.equal(parseLook(bad), 'smooth', String(bad));
  }
  for (const bad of ['', 'sepia', undefined, null, 42, {}, 'Dark']) {
    assert.equal(parseTheme(bad), 'system', String(bad));
  }
  assert.equal(parseLook('oni'), 'oni');
  assert.equal(parseLook('smooth'), 'smooth');
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('dark'), 'dark');
  assert.equal(parseTheme('system'), 'system');
});

test('resolveTheme: a choice stands for itself, system for what Windows says', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

type FakeRoot = HTMLElement & { attrs: Map<string, string>; classes: Set<string>; scheme: () => string | undefined };

function fakeRoot(): FakeRoot {
  const attrs = new Map<string, string>();
  const classes = new Set<string>();
  const style: { colorScheme?: string } = {};
  const root = {
    attrs,
    classes,
    scheme: () => style.colorScheme,
    style,
    setAttribute: (name: string, value: string) => { attrs.set(name, value); },
    getAttribute: (name: string) => attrs.get(name) ?? null,
    classList: {
      toggle: (name: string, force?: boolean) => {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains: (name: string) => classes.has(name),
    },
  };
  return root as unknown as FakeRoot;
}

test('applyLook sets the three attributes, the glass class and the colour scheme', () => {
  const root = fakeRoot();
  applyLook(root, { app: 'xiox', look: 'smooth', theme: 'light', glass: true }, { systemIsDark: () => true });
  assert.equal(root.getAttribute('data-im-app'), 'xiox');
  assert.equal(root.getAttribute('data-im-look'), 'smooth');
  assert.equal(root.getAttribute('data-im-theme'), 'light');
  assert.ok(root.classes.has('im-glass'));
  assert.equal(root.scheme(), 'light');
  applyLook(root, { app: 'xiox', look: 'smooth', theme: 'light', glass: false }, { systemIsDark: () => true });
  assert.ok(!root.classes.has('im-glass'), 'without glass every surface is opaque');
});

test('applyLook never writes system as the theme: it resolves it', () => {
  const root = fakeRoot();
  applyLook(root, { app: 'mukade', look: 'smooth', theme: 'system', glass: false }, { systemIsDark: () => false });
  assert.equal(root.getAttribute('data-im-theme'), 'light');
  applyLook(root, { app: 'mukade', look: 'smooth', theme: 'system', glass: false }, { systemIsDark: () => true });
  assert.equal(root.getAttribute('data-im-theme'), 'dark');
});

test('ONI with the Windows theme resolves to dark whatever Windows says', () => {
  const root = fakeRoot();
  applyLook(root, { app: 'shinatama', look: 'oni', theme: 'system', glass: true }, { systemIsDark: () => false });
  assert.equal(root.getAttribute('data-im-look'), 'oni');
  assert.equal(root.getAttribute('data-im-theme'), 'dark');
  applyLook(root, { app: 'shinatama', look: 'oni', theme: 'light', glass: true }, { systemIsDark: () => true });
  assert.equal(root.getAttribute('data-im-theme'), 'light');
});

test('applyLook with no deps and no window reads the system as dark', () => {
  const root = fakeRoot();
  applyLook(root, { app: 'muro', look: 'smooth', theme: 'system', glass: false });
  assert.equal(root.getAttribute('data-im-theme'), 'dark');
});

test('applyLook asks the system through the root\'s own window when it has one', () => {
  const root = fakeRoot();
  const asked: string[] = [];
  (root as unknown as { ownerDocument: unknown }).ownerDocument = {
    defaultView: { matchMedia: (query: string) => { asked.push(query); return { matches: false }; } },
  };
  applyLook(root, { app: 'muro', look: 'smooth', theme: 'system', glass: false });
  assert.deepEqual(asked, ['(prefers-color-scheme: dark)']);
  assert.equal(root.getAttribute('data-im-theme'), 'light');
});

test('applyLook falls back to Smooth and the Windows theme when the state is corrupt', () => {
  const root = fakeRoot();
  const sent: string[] = [];
  applyLook(
    root,
    { app: 'daodan', look: 'modules' as never, theme: 'sepia' as never, glass: false },
    { systemIsDark: () => true, setWindowTheme: (theme) => { sent.push(theme); } },
  );
  assert.equal(root.getAttribute('data-im-look'), 'smooth');
  assert.equal(root.getAttribute('data-im-theme'), 'dark');
  assert.deepEqual(sent, ['system']);
});

test('applyLook calls setWindowTheme once for two identical calls, and again when the value changes', () => {
  const root = fakeRoot();
  const sent: string[] = [];
  const deps = { systemIsDark: () => true, setWindowTheme: (theme: string) => { sent.push(theme); } };
  const state = { app: 'shinatama', look: 'smooth', theme: 'light', glass: true } as const;
  applyLook(root, state, deps);
  applyLook(root, state, deps);
  assert.deepEqual(sent, ['light']);
  applyLook(root, { ...state, theme: 'dark' }, deps);
  assert.deepEqual(sent, ['light', 'dark']);
  // ONI with the Windows theme asks for dark too, but the look changed: the window is told, for its tint.
  applyLook(root, { ...state, look: 'oni', theme: 'system' }, deps);
  assert.deepEqual(sent, ['light', 'dark', 'dark']);
  applyLook(root, { ...state, look: 'oni', theme: 'dark' }, deps);
  assert.deepEqual(sent, ['light', 'dark', 'dark'], 'the same word, look and drawn theme: nothing to send');
  applyLook(root, { ...state, look: 'smooth', theme: 'system' }, deps);
  assert.deepEqual(sent, ['light', 'dark', 'dark', 'system']);
});

test('applyLook tells the window the look and the theme the page draws with the window theme', () => {
  const root = fakeRoot();
  const sent: unknown[] = [];
  const setWindowTheme = (theme: string, detail: unknown): void => { sent.push([theme, detail]); };
  applyLook(root, { app: 'xiox', look: 'oni', theme: 'light', glass: true }, { systemIsDark: () => true, setWindowTheme });
  applyLook(root, { app: 'xiox', look: 'smooth', theme: 'system', glass: true }, { systemIsDark: () => false, setWindowTheme });
  assert.deepEqual(sent, [
    ['light', { look: 'oni', resolved: 'light' }],
    ['system', { look: 'smooth', resolved: 'light' }],
  ]);
});

test('applyLook tells the window again when only the look changes', () => {
  const root = fakeRoot();
  const sent: unknown[] = [];
  const deps = { systemIsDark: () => true, setWindowTheme: (theme: string, detail: unknown) => { sent.push([theme, detail]); } };
  applyLook(root, { app: 'muro', look: 'smooth', theme: 'dark', glass: true }, deps);
  applyLook(root, { app: 'muro', look: 'oni', theme: 'dark', glass: true }, deps);
  assert.deepEqual(sent, [
    ['dark', { look: 'smooth', resolved: 'dark' }],
    ['dark', { look: 'oni', resolved: 'dark' }],
  ]);
});

test('applyLook tells the window again when Windows changes its colours under the Windows theme', () => {
  const root = fakeRoot();
  const sent: unknown[] = [];
  let dark = true;
  const deps = { systemIsDark: () => dark, setWindowTheme: (theme: string, detail: unknown) => { sent.push([theme, detail]); } };
  const state = { app: 'mukade', look: 'smooth', theme: 'system', glass: true } as const;
  applyLook(root, state, deps);
  applyLook(root, state, deps);
  dark = false;
  applyLook(root, state, deps);
  assert.deepEqual(sent, [
    ['system', { look: 'smooth', resolved: 'dark' }],
    ['system', { look: 'smooth', resolved: 'light' }],
  ], 'the same word, and the theme the page draws changed: the tint follows it');
});

test('applyLook keeps what it sent per root', () => {
  const sent: string[] = [];
  const deps = { systemIsDark: () => true, setWindowTheme: (theme: string) => { sent.push(theme); } };
  const state = { app: 'xiox', look: 'smooth', theme: 'dark', glass: true } as const;
  applyLook(fakeRoot(), state, deps);
  applyLook(fakeRoot(), state, deps);
  assert.deepEqual(sent, ['dark', 'dark']);
});

test('applyLook sends the window theme again after a failed attempt', async () => {
  const root = fakeRoot();
  const sent: string[] = [];
  let fail = true;
  const deps = {
    systemIsDark: () => true,
    setWindowTheme: (theme: string) => { sent.push(theme); return fail ? Promise.reject(new Error('no window')) : Promise.resolve(); },
  };
  const state = { app: 'xiox', look: 'smooth', theme: 'light', glass: true } as const;
  applyLook(root, state, deps);
  await settle();
  fail = false;
  applyLook(root, state, deps);
  await settle();
  applyLook(root, state, deps);
  assert.deepEqual(sent, ['light', 'light'], 'the failed one is retried, the delivered one is not');
});

test('applyLook still draws the page when the window refuses its theme', () => {
  const root = fakeRoot();
  const state = { app: 'xiox', look: 'smooth', theme: 'dark', glass: true } as const;
  applyLook(root, state, { setWindowTheme: () => { throw new Error('no window'); } });
  assert.equal(root.getAttribute('data-im-theme'), 'dark');
});

// ---- zoom -----------------------------------------------------------------------------------------------------

test('clampZoom keeps 50 to 200 percent, in steps of 10', () => {
  assert.equal(clampZoom(3), 2);
  assert.equal(clampZoom(0.1), 0.5);
  assert.equal(clampZoom(1.24), 1.2);
  assert.equal(clampZoom(1), 1);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(Number.POSITIVE_INFINITY), 2);
  assert.equal(clampZoom(Number.NEGATIVE_INFINITY), 0.5);
});

test('clampZoom rounds a level that is not a multiple of 10 to the nearest one, half up, and takes no list of levels', () => {
  assert.equal(clampZoom(0.67), 0.7);
  assert.equal(clampZoom(0.75), 0.8);
  assert.equal(clampZoom(1.25), 1.3);
  assert.equal(clampZoom(1.75), 1.8);
  assert.equal(clampZoom(1.95), 2);
  assert.equal(clampZoom(0.45), 0.5);
  assert.equal(clampZoom.length, 1, "the second parameter, the app's own steps, is gone");
});

test('stepZoom steps by 10 percent, stops at the ends and resets on 0', () => {
  assert.equal(stepZoom(2, 1), 2);
  assert.equal(stepZoom(0.5, -1), 0.5);
  assert.equal(stepZoom(1.3, 0), 1);
  assert.equal(stepZoom(1, 1), 1.1);
  assert.equal(stepZoom(1, -1), 0.9);
  let level = 1;
  for (let i = 0; i < 10; i++) level = stepZoom(level, 1);
  assert.equal(level, 2, 'ten steps up are exactly 200 percent, with no float residue');
  for (let i = 0; i < 15; i++) level = stepZoom(level, -1);
  assert.equal(level, 0.5);
});

test('stepZoom steps from a level that is not a multiple of 10 by first rounding it, and takes no list of levels', () => {
  assert.equal(stepZoom(0.67, 1), 0.8);
  assert.equal(stepZoom(0.67, -1), 0.6);
  assert.equal(stepZoom(1.75, 1), 1.9);
  assert.equal(stepZoom(1.25, 0), 1);
  assert.equal(stepZoom.length, 2, "the third parameter, the app's own steps, is gone");
});

test('zoomDirection reads Ctrl+= Ctrl++ Ctrl+- Ctrl+0 by key or by physical key', () => {
  const key = (init: Partial<Record<'key' | 'code', string>> & Partial<Record<'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey', boolean>>) =>
    ({ key: '', code: '', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, ...init });
  assert.equal(zoomDirection(key({ key: '=', code: 'Equal' })), 1);
  assert.equal(zoomDirection(key({ key: '+', code: 'Equal', shiftKey: true })), 1);
  assert.equal(zoomDirection(key({ key: '+', code: 'NumpadAdd' })), 1);
  assert.equal(zoomDirection(key({ key: '+', code: 'BracketRight' })), 1, 'where + has its own key');
  assert.equal(zoomDirection(key({ key: '-', code: 'Minus' })), -1);
  assert.equal(zoomDirection(key({ key: '-', code: 'NumpadSubtract' })), -1);
  assert.equal(zoomDirection(key({ key: '0', code: 'Digit0' })), 0);
  assert.equal(zoomDirection(key({ key: '0', code: 'Numpad0' })), 0);
  assert.equal(zoomDirection(key({ key: '=', code: 'Equal', ctrlKey: false })), null);
  assert.equal(zoomDirection(key({ key: '=', code: 'Equal', altKey: true })), null);
  assert.equal(zoomDirection(key({ key: '=', code: 'Equal', metaKey: true })), null);
  assert.equal(zoomDirection(key({ key: ')', code: 'Digit0', shiftKey: true })), null);
  assert.equal(zoomDirection(key({ key: 'a', code: 'KeyA' })), null);
});

test('wheelPixels gives a notch the same length at every zoom', () => {
  assert.equal(wheelPixels(100, 0, 1), 100);
  assert.equal(wheelPixels(50, 0, 2), 100, 'the engine reports CSS pixels, which shrink as the page zooms in');
  assert.equal(wheelPixels(3, 1, 2), 120, 'lines are not zoomed');
  assert.equal(wheelPixels(1, 2, 2), 800, 'pages are not zoomed');
});

type StubDoc = Document & { fire(type: string, init?: Record<string, unknown>, target?: unknown): Event };

/** A document that is only an event target; `fire` dispatches an event with the given properties (and target). */
function stubDoc(extra: Record<string, unknown> = {}): StubDoc {
  const doc = new EventTarget() as unknown as StubDoc & Record<string, unknown>;
  Object.assign(doc, extra);
  doc.fire = (type, init = {}, target) => {
    const event = Object.assign(new Event(type, { cancelable: true, bubbles: true }), init);
    if (target !== undefined) Object.defineProperty(event, 'target', { value: target });
    doc.dispatchEvent(event);
    return event;
  };
  return doc;
}

const ctrl = (key: string, code = '', extra: Record<string, unknown> = {}) =>
  ({ key, code, ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, repeat: false, ...extra });

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
}

test('mountZoom applies the saved level at once, 100 percent included', () => {
  const applied: number[] = [];
  mountZoom(stubDoc(), { apply: (level) => { applied.push(level); }, storage: memoryStorage({ 'imago.zoom': '1.4' }) });
  mountZoom(stubDoc(), { apply: (level) => { applied.push(level); }, storage: memoryStorage() });
  mountZoom(stubDoc(), { apply: (level) => { applied.push(level); }, storage: memoryStorage({ 'imago.zoom': 'wide' }) });
  mountZoom(stubDoc(), { apply: (level) => { applied.push(level); }, storage: memoryStorage({ 'imago.zoom': '9' }) });
  assert.deepEqual(applied, [1.4, 1, 1, 2]);
});

test('mountZoom: Ctrl+= and Ctrl+- and Ctrl+0 zoom, save, and keep the keys from the page', async () => {
  const doc = stubDoc();
  const storage = memoryStorage();
  const applied: number[] = [];
  const changed: number[] = [];
  mountZoom(doc, { apply: (level) => { applied.push(level); }, storage, storageKey: 'app.zoom', onChange: (level) => { changed.push(level); } });

  const zoomIn = doc.fire('keydown', ctrl('=', 'Equal'));
  assert.ok(zoomIn.defaultPrevented);
  assert.ok(zoomIn.cancelBubble, 'a terminal or a field never sees these keys');
  doc.fire('keydown', ctrl('=', 'Equal'));
  doc.fire('keydown', ctrl('-', 'Minus'));
  await settle();
  assert.deepEqual(applied, [1, 1.1, 1.2, 1.1]);
  assert.deepEqual(changed, [1.1, 1.2, 1.1]);
  assert.equal(storage.items.get('app.zoom'), '1.1');
  doc.fire('keydown', ctrl('0', 'Digit0'));
  await settle();
  assert.equal(applied.at(-1), 1);
  assert.equal(storage.items.get('app.zoom'), '1');
});

test('mountZoom ignores a held Ctrl+0 and a step past the end', async () => {
  const doc = stubDoc();
  const applied: number[] = [];
  mountZoom(doc, { apply: (level) => { applied.push(level); }, storage: memoryStorage({ 'imago.zoom': '2' }) });
  const past = doc.fire('keydown', ctrl('=', 'Equal'));
  assert.ok(past.defaultPrevented, 'the browser must not zoom either');
  const held = doc.fire('keydown', ctrl('0', 'Digit0', { repeat: true }));
  assert.ok(held.defaultPrevented);
  await settle();
  assert.deepEqual(applied, [2]);
});

test('mountZoom takes the level back when the window cannot zoom', async () => {
  const doc = stubDoc();
  const storage = memoryStorage();
  const changed: number[] = [];
  let calls = 0;
  mountZoom(doc, {
    apply: () => (calls++ === 0 ? undefined : Promise.reject(new Error('no webview'))),
    storage,
    onChange: (level) => { changed.push(level); },
  });
  doc.fire('keydown', ctrl('=', 'Equal'));
  await settle();
  assert.deepEqual(changed, [1.1, 1], 'moved at once, then moved back');
  assert.equal(storage.items.has('imago.zoom'), false, 'a level the window refused is not saved');
  doc.fire('keydown', ctrl('=', 'Equal'));
  await settle();
  assert.deepEqual(changed, [1.1, 1, 1.1, 1], 'the next press starts from the level that holds');
});

test('mountZoom: Ctrl+wheel zooms one step per notch, small deltas add up, a plain wheel does nothing', async () => {
  const doc = stubDoc();
  const applied: number[] = [];
  mountZoom(doc, { apply: (level) => { applied.push(level); }, storage: memoryStorage() });
  const plain = doc.fire('wheel', { ctrlKey: false, deltaY: -100, deltaMode: 0 });
  assert.ok(!plain.defaultPrevented);
  const notch = doc.fire('wheel', { ctrlKey: true, deltaY: -100, deltaMode: 0 });
  assert.ok(notch.defaultPrevented, 'the browser must not zoom as well');
  doc.fire('wheel', { ctrlKey: true, deltaY: 30, deltaMode: 0 });
  assert.deepEqual(applied, [1, 1.1], 'a small delta is not yet a step');
  doc.fire('wheel', { ctrlKey: true, deltaY: 30, deltaMode: 0 });
  await settle();
  assert.deepEqual(applied, [1, 1.1, 1], 'two small deltas make one step down');
});

test('mountZoom: the wheel and the keys step by 10 whatever steps an older app still passes', async () => {
  const doc = stubDoc();
  const applied: number[] = [];
  mountZoom(doc, { apply: (level) => { applied.push(level); }, storage: memoryStorage(), levels: [0.67, 0.75, 1, 1.25, 1.75] } as Parameters<typeof mountZoom>[1]);
  doc.fire('wheel', { ctrlKey: true, deltaY: -100, deltaMode: 0 });
  doc.fire('keydown', ctrl('=', 'Equal'));
  await settle();
  assert.deepEqual(applied, [1, 1.1, 1.2]);
});

test('mountZoom stops answering after it is unmounted', () => {
  const doc = stubDoc();
  const applied: number[] = [];
  const unmount = mountZoom(doc, { apply: (level) => { applied.push(level); }, storage: memoryStorage() });
  unmount();
  const event = doc.fire('keydown', ctrl('=', 'Equal'));
  assert.ok(!event.defaultPrevented);
  assert.deepEqual(applied, [1]);
});

test('mountZoom survives storage that throws', () => {
  const doc = stubDoc();
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const applied: number[] = [];
  mountZoom(doc, { apply: (level) => { applied.push(level); }, storage: broken });
  doc.fire('keydown', ctrl('=', 'Equal'));
  assert.deepEqual(applied, [1, 1.1], 'the zoom lasts until the window closes');
});

// ---- window buttons -------------------------------------------------------------------------------------------

class FakeButton extends EventTarget {
  attributes = new Map<string, string>();
  title = '';
  box = { left: 1000, top: 0, width: 46, height: 46 };
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  getBoundingClientRect() { return this.box; }
  click(): void { this.dispatchEvent(new Event('click')); }
}

class FakeObserver {
  static all: FakeObserver[] = [];
  observed: unknown[] = [];
  options: unknown;
  disconnected = false;
  callback: () => void;
  constructor(callback: () => void) { this.callback = callback; FakeObserver.all.push(this); }
  observe(target: unknown, options?: unknown): void { this.observed.push(target); this.options = options; }
  disconnect(): void { this.disconnected = true; }
}
class FakeResizeObserver extends FakeObserver {}
class FakeMutationObserver extends FakeObserver {}

function fakeWindow(ratio = 1) {
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  const queue = new Map<number, () => void>();
  let next = 1;
  const queries: { text: string; target: EventTarget }[] = [];
  Object.assign(win, {
    devicePixelRatio: ratio,
    requestAnimationFrame: (callback: () => void) => { queue.set(next, callback); return next++; },
    cancelAnimationFrame: (id: number) => { queue.delete(id); },
    matchMedia: (text: string) => { const target = new EventTarget(); queries.push({ text, target }); return target; },
    ResizeObserver: FakeResizeObserver,
    MutationObserver: FakeMutationObserver,
  });
  return {
    win,
    queries,
    pending: () => queue.size,
    frame: () => { const callbacks = [...queue.values()]; queue.clear(); for (const callback of callbacks) callback(); },
  };
}

function setup(options: { ratio?: number; buttons?: boolean } = {}) {
  FakeObserver.all = [];
  const { win, queries, pending, frame } = fakeWindow(options.ratio);
  const documentElement = {};
  const buttons = { minimize: new FakeButton(), maximize: new FakeButton(), close: new FakeButton() };
  const titlebar = {
    ownerDocument: { defaultView: win, documentElement },
    querySelector: (selector: string) => {
      if (options.buttons === false) return null;
      const match = /^\[data-im-window="(minimize|maximize|close)"\]$/.exec(selector);
      return match ? buttons[match[1] as keyof typeof buttons] : null;
    },
  } as unknown as HTMLElement;
  const calls: string[] = [];
  const rects: { x: number; y: number; width: number; height: number }[] = [];
  const hoverListeners: ((state: 'none' | 'hover' | 'pressed') => void)[] = [];
  const maximizeListeners: ((maximized: boolean) => void)[] = [];
  let unsubscribed = 0;
  const api: WindowApi = {
    minimize: () => { calls.push('minimize'); },
    toggleMaximize: () => { calls.push('toggleMaximize'); },
    close: () => { calls.push('close'); },
    reportMaximizeRect: (rect) => { rects.push(rect); },
    onOsHover: (callback) => { hoverListeners.push(callback); return () => { unsubscribed++; }; },
    onMaximized: (callback) => { maximizeListeners.push(callback); return () => { unsubscribed++; }; },
  };
  return {
    api, titlebar, buttons, calls, rects, win, queries, pending, frame, documentElement,
    hover: (state: 'none' | 'hover' | 'pressed') => { for (const callback of hoverListeners) callback(state); },
    maximized: (value: boolean) => { for (const callback of maximizeListeners) callback(value); },
    unsubscribed: () => unsubscribed,
    resizeObserver: () => FakeObserver.all.find((o) => o instanceof FakeResizeObserver)!,
    mutationObserver: () => FakeObserver.all.find((o) => o instanceof FakeMutationObserver)!,
  };
}

test('the window buttons call the window api', () => {
  const t = setup();
  mountWindowControls(t.titlebar, t.api);
  t.buttons.minimize.click();
  t.buttons.maximize.click();
  t.buttons.close.click();
  assert.deepEqual(t.calls, ['minimize', 'toggleMaximize', 'close']);
});

test('mountWindowControls reports the maximize button in physical pixels on mount', () => {
  const t = setup({ ratio: 1.5 });
  t.buttons.maximize.box = { left: 1000.4, top: 0.2, width: 46, height: 46 };
  mountWindowControls(t.titlebar, t.api);
  assert.equal(t.rects.length, 0, 'the report waits for the next frame, so one layout serves every change');
  t.frame();
  assert.deepEqual(t.rects, [{ x: 1501, y: 0, width: 69, height: 69 }]);
});

test('the maximize rectangle is sent again only when it changed, or the window resized', () => {
  const t = setup();
  mountWindowControls(t.titlebar, t.api);
  t.frame();
  t.resizeObserver().callback();
  t.frame();
  assert.equal(t.rects.length, 1, 'same rectangle: nothing to send');
  t.buttons.maximize.box = { left: 900, top: 0, width: 46, height: 46 };
  t.resizeObserver().callback();
  t.resizeObserver().callback();
  assert.equal(t.pending(), 1, 'several changes in a frame make one report');
  t.frame();
  assert.equal(t.rects.length, 2);
  assert.equal(t.rects[1]?.x, 900);
  // Maximized, the native button also covers the resize border: it is placed again on every resize.
  t.win.dispatchEvent(new Event('resize'));
  t.frame();
  assert.equal(t.rects.length, 3);
  assert.deepEqual(t.rects[2], t.rects[1]);
});

test('the maximize rectangle follows a change of zoom, again and again', () => {
  const t = setup({ ratio: 1 });
  mountWindowControls(t.titlebar, t.api);
  t.frame();
  assert.equal(t.queries.at(-1)?.text, '(resolution: 1dppx)');
  t.win.devicePixelRatio = 1.25;
  t.queries.at(-1)!.target.dispatchEvent(new Event('change'));
  t.frame();
  assert.deepEqual(t.rects.at(-1), { x: 1250, y: 0, width: 58, height: 58 });
  assert.equal(t.queries.at(-1)?.text, '(resolution: 1.25dppx)', 'it watches the new ratio');
  t.win.devicePixelRatio = 1.5;
  t.queries.at(-1)!.target.dispatchEvent(new Event('change'));
  t.frame();
  assert.equal(t.rects.at(-1)?.x, 1500);
});

test('the maximize rectangle follows a change of look', () => {
  const t = setup();
  mountWindowControls(t.titlebar, t.api);
  t.frame();
  assert.deepEqual(t.mutationObserver().observed, [t.documentElement]);
  assert.deepEqual(t.mutationObserver().options, { attributes: true, attributeFilter: ['data-im-look'] });
  t.buttons.maximize.box = { left: 0, top: 0, width: 0, height: 0 };
  t.mutationObserver().callback();
  t.frame();
  assert.deepEqual(t.rects.at(-1), { x: 0, y: 0, width: 0, height: 0 }, 'a hidden button reports nothing, so the overlay goes away');
});

test('the hover of the native overlay shows on the maximize button as data-im-os', () => {
  const t = setup();
  mountWindowControls(t.titlebar, t.api);
  t.hover('hover');
  assert.equal(t.buttons.maximize.getAttribute('data-im-os'), 'hover');
  t.hover('pressed');
  assert.equal(t.buttons.maximize.getAttribute('data-im-os'), 'pressed');
  t.hover('none');
  assert.equal(t.buttons.maximize.getAttribute('data-im-os'), null);
  assert.equal(t.buttons.minimize.getAttribute('data-im-os'), null);
});

test('the maximize button says what it will do', () => {
  const t = setup();
  mountWindowControls(t.titlebar, t.api);
  t.maximized(true);
  assert.equal(t.buttons.maximize.getAttribute('aria-label'), 'Restore window');
  assert.equal(t.buttons.maximize.title, 'Restore');
  assert.equal(t.buttons.maximize.getAttribute('data-im-maximized'), 'true');
  t.maximized(false);
  assert.equal(t.buttons.maximize.getAttribute('aria-label'), 'Maximize window');
  assert.equal(t.buttons.maximize.title, 'Maximize');
  assert.equal(t.buttons.maximize.getAttribute('data-im-maximized'), 'false');
});

test("the maximize button says it in the app's words when the app gives them", () => {
  const t = setup();
  const labels = { maximize: 'Ingrandisci la finestra', restore: 'Ripristina la finestra', maximizeTitle: 'Ingrandisci', restoreTitle: 'Ripristina' };
  mountWindowControls(t.titlebar, t.api, { labels });
  t.maximized(true);
  assert.equal(t.buttons.maximize.getAttribute('aria-label'), 'Ripristina la finestra');
  assert.equal(t.buttons.maximize.title, 'Ripristina');
  t.maximized(false);
  assert.equal(t.buttons.maximize.getAttribute('aria-label'), 'Ingrandisci la finestra');
  assert.equal(t.buttons.maximize.title, 'Ingrandisci');
  // A word the app leaves out is the English one.
  const u = setup();
  mountWindowControls(u.titlebar, u.api, { labels: { restore: 'Ripristina la finestra' } });
  u.maximized(true);
  assert.equal(u.buttons.maximize.getAttribute('aria-label'), 'Ripristina la finestra');
  assert.equal(u.buttons.maximize.title, 'Restore');
});

/** What escapes while `run` and the turns after it go by: unhandled rejections and errors thrown out of listeners. */
async function escapedWhile(run: () => void): Promise<unknown[]> {
  const seen: unknown[] = [];
  const note = (reason: unknown): void => { seen.push(reason); };
  process.on('unhandledRejection', note);
  process.on('uncaughtException', note);
  try {
    run();
    await settle();
    await settle();
  } finally {
    process.off('unhandledRejection', note);
    process.off('uncaughtException', note);
  }
  return seen;
}

test('a window button whose action rejects reports it once to onError', async () => {
  const t = setup();
  const failure = new Error('window is gone');
  const errors: [string, unknown][] = [];
  mountWindowControls(t.titlebar, { ...t.api, close: () => Promise.reject(failure) }, { onError: (action, error) => { errors.push([action, error]); } });
  const escaped = await escapedWhile(() => { t.buttons.close.click(); });
  assert.deepEqual(errors, [['close', failure]]);
  assert.deepEqual(escaped, []);
});

test('a window button whose action throws reports it once to onError', async () => {
  const t = setup();
  const failure = new Error('no window');
  const errors: [string, unknown][] = [];
  mountWindowControls(t.titlebar, { ...t.api, minimize: () => { throw failure; } }, { onError: (action, error) => { errors.push([action, error]); } });
  const escaped = await escapedWhile(() => { t.buttons.minimize.click(); });
  assert.deepEqual(errors, [['minimize', failure]]);
  assert.deepEqual(escaped, []);
});

test('the maximize button names itself maximize when its action fails', async () => {
  const t = setup();
  const failure = new Error('cannot maximize');
  const errors: [string, unknown][] = [];
  mountWindowControls(t.titlebar, { ...t.api, toggleMaximize: () => Promise.reject(failure) }, { onError: (action, error) => { errors.push([action, error]); } });
  await escapedWhile(() => { t.buttons.maximize.click(); });
  assert.deepEqual(errors, [['maximize', failure]]);
});

test('a window button that works does not report', async () => {
  const t = setup();
  const errors: unknown[] = [];
  mountWindowControls(t.titlebar, { ...t.api, close: () => Promise.resolve('closed') }, { onError: (...args) => { errors.push(args); } });
  const escaped = await escapedWhile(() => { t.buttons.minimize.click(); t.buttons.close.click(); });
  assert.deepEqual(errors, []);
  assert.deepEqual(escaped, []);
});

test('without onError a failing window button leaves no unhandled rejection and no thrown error', async () => {
  const t = setup();
  const api = {
    ...t.api,
    minimize: () => { throw new Error('no window'); },
    toggleMaximize: () => Promise.reject(new Error('refused')),
    close: () => Promise.reject(new Error('window is gone')),
  };
  mountWindowControls(t.titlebar, api);
  const escaped = await escapedWhile(() => {
    t.buttons.minimize.click();
    t.buttons.maximize.click();
    t.buttons.close.click();
  });
  assert.deepEqual(escaped, []);
});

test('an onError that itself throws does not turn the click into an uncaught error', async () => {
  const t = setup();
  mountWindowControls(t.titlebar, { ...t.api, close: () => Promise.reject(new Error('window is gone')), minimize: () => { throw new Error('no window'); } }, {
    onError: () => { throw new Error('reporter failed'); },
  });
  const escaped = await escapedWhile(() => { t.buttons.close.click(); t.buttons.minimize.click(); });
  assert.deepEqual(escaped, []);
});

test('a window api without maximize notifications still mounts', () => {
  const t = setup();
  const { onMaximized: _unused, ...api } = t.api;
  const unmount = mountWindowControls(t.titlebar, api);
  t.buttons.maximize.click();
  assert.deepEqual(t.calls, ['toggleMaximize']);
  unmount();
});

test('unmounting the window buttons lets go of everything', () => {
  const t = setup();
  const unmount = mountWindowControls(t.titlebar, t.api);
  assert.equal(t.pending(), 1);
  unmount();
  assert.equal(t.pending(), 0, 'the pending report is cancelled');
  assert.equal(t.unsubscribed(), 2);
  assert.ok(t.resizeObserver().disconnected);
  assert.ok(t.mutationObserver().disconnected);
  t.buttons.minimize.click();
  t.buttons.maximize.click();
  t.buttons.close.click();
  assert.deepEqual(t.calls, []);
  t.win.dispatchEvent(new Event('resize'));
  t.queries.at(-1)!.target.dispatchEvent(new Event('change'));
  assert.equal(t.pending(), 0);
  unmount();
});

test('a title bar without the buttons mounts and unmounts quietly', () => {
  const t = setup({ buttons: false });
  const unmount = mountWindowControls(t.titlebar, t.api);
  t.frame();
  assert.deepEqual(t.rects, []);
  unmount();
});

// ---- the desktop guard ----------------------------------------------------------------------------------------

/** An element that answers `closest` for the listed selector parts only. */
function element(matches: string[]) {
  const self = {
    closest: (selector: string) => (selector.split(',').some((part) => matches.includes(part.trim())) ? self : null),
  };
  return self;
}

test('guardDesktop refuses the keys of a browser', () => {
  const doc = stubDoc();
  guardDesktop(doc, {});
  const refused = [
    { key: 'F5' }, { key: 'F7' }, { key: 'F12' }, { key: 'BrowserRefresh' }, { key: 'BrowserBack' },
    { key: 'r', ctrlKey: true }, { key: 'R', ctrlKey: true }, { key: 'p', ctrlKey: true }, { key: 'u', ctrlKey: true },
    { key: 'f', ctrlKey: true }, { key: 'g', ctrlKey: true }, { key: 's', ctrlKey: true }, { key: 'o', ctrlKey: true },
    { key: 'r', ctrlKey: true, shiftKey: true }, { key: 'I', ctrlKey: true, shiftKey: true }, { key: 'j', ctrlKey: true, shiftKey: true },
    { key: 'ArrowLeft', altKey: true }, { key: 'ArrowRight', altKey: true }, { key: 'Home', altKey: true },
  ];
  for (const init of refused) {
    const event = doc.fire('keydown', { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...init });
    assert.ok(event.defaultPrevented, JSON.stringify(init));
  }
});

test('guardDesktop leaves the keys the app uses alone', () => {
  const doc = stubDoc();
  guardDesktop(doc, {});
  const kept = [
    { key: 'k', ctrlKey: true }, { key: 'a', ctrlKey: true }, { key: 'c', ctrlKey: true }, { key: 'v', ctrlKey: true },
    { key: 'z', ctrlKey: true }, { key: 'r' }, { key: 'F6' }, { key: 'F3' }, { key: 'Tab' }, { key: 'Escape' },
    { key: 'ArrowLeft' }, { key: 'ArrowLeft', altKey: true, ctrlKey: true }, { key: 'F5', altKey: true },
    { key: 'r', ctrlKey: true, altKey: true }, { key: 'r', metaKey: true },
  ];
  for (const init of kept) {
    const event = doc.fire('keydown', { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...init });
    assert.ok(!event.defaultPrevented, JSON.stringify(init));
  }
});

test('guardDesktop does not stop a refused key: the app\'s own handler for it still runs', () => {
  const doc = stubDoc();
  guardDesktop(doc, {});
  const event = doc.fire('keydown', { key: 'f', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false });
  assert.ok(event.defaultPrevented);
  assert.ok(!event.cancelBubble);
});

test('guardDesktop lets a terminal or an editor have its reload keys', () => {
  const doc = stubDoc();
  guardDesktop(doc, { allowReloadIn: '.xterm, .cm-editor' });
  const keys = { key: 'r', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false };
  assert.ok(!doc.fire('keydown', keys, element(['.xterm'])).defaultPrevented);
  assert.ok(!doc.fire('keydown', keys, element(['.cm-editor'])).defaultPrevented);
  assert.ok(doc.fire('keydown', keys, element([])).defaultPrevented);
  assert.ok(doc.fire('keydown', { ...keys, key: 'F5' }, null).defaultPrevented, 'no element: the key is the page\'s');
});

test('guardDesktop refuses the page context menu outside fields', () => {
  const doc = stubDoc({ getSelection: () => null });
  guardDesktop(doc, { allowReloadIn: '.xterm' });
  assert.ok(doc.fire('contextmenu', {}, element([])).defaultPrevented, 'chrome');
  assert.ok(doc.fire('contextmenu', {}, null).defaultPrevented);
  for (const field of ['input', 'textarea', 'select', '[contenteditable=""]', '[contenteditable="true"]']) {
    assert.ok(!doc.fire('contextmenu', {}, element([field])).defaultPrevented, field);
  }
  assert.ok(!doc.fire('contextmenu', {}, element(['.xterm'])).defaultPrevented, 'a terminal has its own menu');
});

test('guardDesktop keeps the context menu over selected text', () => {
  const target = element([]);
  const selection = { isCollapsed: false, containsNode: (node: unknown, partly: boolean) => node === target && partly };
  const doc = stubDoc({ getSelection: () => selection });
  guardDesktop(doc, {});
  assert.ok(!doc.fire('contextmenu', {}, target).defaultPrevented, 'Copy belongs to what is selected');
  assert.ok(doc.fire('contextmenu', {}, element([])).defaultPrevented, 'the selection is somewhere else');
  selection.isCollapsed = true;
  assert.ok(doc.fire('contextmenu', {}, target).defaultPrevented, 'nothing is selected');
});

test('guardDesktop refuses the back and forward buttons of the mouse', () => {
  const doc = stubDoc();
  guardDesktop(doc, {});
  assert.ok(doc.fire('mouseup', { button: 3 }).defaultPrevented);
  assert.ok(doc.fire('mouseup', { button: 4 }).defaultPrevented);
  assert.ok(!doc.fire('mouseup', { button: 0 }).defaultPrevented);
  assert.ok(!doc.fire('mouseup', { button: 2 }).defaultPrevented);
});

test('guardDesktop refuses to drag the chrome out of the window', () => {
  const doc = stubDoc();
  guardDesktop(doc, {});
  assert.ok(doc.fire('dragstart', {}, element(['img'])).defaultPrevented, 'an image');
  assert.ok(doc.fire('dragstart', {}, element(['a'])).defaultPrevented, 'a link');
  const tab = { closest: (selector: string) => (selector.includes('[draggable="true"]') ? tab : selector.includes('img') ? tab : null) };
  assert.ok(!doc.fire('dragstart', {}, tab).defaultPrevented, 'a thing the app made draggable');
  assert.ok(!doc.fire('dragstart', {}, element(['input'])).defaultPrevented, 'selected text in a field');
  assert.ok(!doc.fire('dragstart', {}, null).defaultPrevented);
});

test('guardDesktop stops guarding when it is removed', () => {
  const doc = stubDoc({ getSelection: () => null });
  const remove = guardDesktop(doc, {});
  remove();
  const keys = { key: 'F5', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false };
  assert.ok(!doc.fire('keydown', keys).defaultPrevented);
  assert.ok(!doc.fire('contextmenu', {}, element([])).defaultPrevented);
  assert.ok(!doc.fire('mouseup', { button: 3 }).defaultPrevented);
  assert.ok(!doc.fire('dragstart', {}, element(['img'])).defaultPrevented);
});

// ---- the entry point -------------------------------------------------------------------------------------------

test('the shell entry point exports every public name', () => {
  for (const name of [
    'parseLook', 'parseTheme', 'resolveTheme', 'windowThemeFor', 'applyLook',
    'clampZoom', 'stepZoom', 'zoomDirection', 'wheelPixels', 'mountZoom',
    'mountWindowControls', 'guardDesktop',
  ]) {
    assert.equal(typeof (shell as Record<string, unknown>)[name], 'function', name);
  }
  for (const name of ['applyShinatamaPalette', 'SHINATAMA_PALETTES']) {
    assert.ok(!(name in shell), `${name} is Shinatama's, from the tag v0.1.4: the package does not export it`);
  }
});
