import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistry } from '../ts/ui/commands.ts';
import type { Command, KeyEventLike, Registry } from '../ts/ui/commands.ts';
import {
  footerKeys,
  LOOK_ONI,
  LOOK_SMOOTH,
  mountApp,
  PALETTE_COMMAND,
  SEARCH_COMMAND,
  standardCommands,
  THEME_DARK,
  THEME_LIGHT,
  THEME_SYSTEM,
  type AppearanceOptions,
} from '../ts/ui/app.ts';
import { guardDesktop } from '../ts/shell/desktop-guard.ts';
import { inspector } from '../ts/ui/inspector.ts';
import { pushLayer, type LayerKind } from '../ts/ui/layers.ts';

// Plain objects stand in for the document and the shell, as in commands.test.ts and layers.test.ts: the modules
// must not need a DOM. What the browser does with them (the palette opening, the drawer sliding) is the gallery's test.

const press = (key: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...extra,
});

const command = (id: string, keys?: string, extra: Partial<Command> = {}): Command => ({ id, title: id, keys, run: () => {}, ...extra });

type Listener = (event: never) => void;
type Listening = { type: string; listener: Listener; capture: boolean };

// Something that listens: it keeps what is attached, so a test can count it, and fires what is attached for a type.
function listening() {
  const active: Listening[] = [];
  return {
    active,
    addEventListener(type: string, listener: Listener, capture: boolean | { capture?: boolean } = false) {
      active.push({ type, listener, capture: typeof capture === 'object' ? capture.capture === true : capture });
    },
    removeEventListener(type: string, listener: Listener, capture: boolean | { capture?: boolean } = false) {
      const wanted = typeof capture === 'object' ? capture.capture === true : capture;
      const at = active.findIndex((entry) => entry.type === type && entry.listener === listener && entry.capture === wanted);
      if (at !== -1) active.splice(at, 1);
    },
    // Capturing listeners run before the others, as in a browser; `phase` runs only one of the two. A listener that
    // stops the event (`stopImmediatePropagation`) is the last to see it.
    // The event's `currentTarget` is this object while its listeners run, as in a browser.
    dispatch(type: string, event: unknown, phase: 'capture' | 'bubble' | 'both' = 'both') {
      const ours = active.filter((entry) => entry.type === type);
      const capturing = phase === 'bubble' ? [] : ours.filter((e) => e.capture);
      const bubbling = phase === 'capture' ? [] : ours.filter((e) => !e.capture);
      for (const entry of [...capturing, ...bubbling]) {
        if ((event as { stopped?: boolean }).stopped) return;
        (event as { currentTarget?: unknown }).currentTarget = this;
        (entry.listener as (event: unknown) => void)(event);
      }
    },
  };
}

// An element with a name, a class and children, that writes itself as HTML: enough for `footerKeys`.
class FakeElement {
  tag: string;
  className = '';
  textContent = '';
  nodes: (FakeElement | string)[] = [];
  constructor(tag: string) {
    this.tag = tag;
  }
  append(...nodes: (FakeElement | string)[]) {
    this.nodes.push(...nodes);
  }
  get children(): FakeElement[] {
    return this.nodes.filter((node): node is FakeElement => typeof node !== 'string');
  }
  get html(): string {
    const inside = this.nodes.map((node) => (typeof node === 'string' ? node : node.html)).join('') + this.textContent;
    return `<${this.tag}${this.className ? ` class="${this.className}"` : ''}>${inside}</${this.tag}>`;
  }
}

const fakeDocument = () => ({
  ...listening(),
  nodeType: 9, // a document, for the code that looks for the document an event is on
  defaultView: null,
  createElement: (tag: string) => new FakeElement(tag),
});

type FakeDocument = ReturnType<typeof fakeDocument>;

// A shell that has these parts, found by the selectors the package looks for.
function fakeShell(doc: FakeDocument, parts: Record<string, unknown> = {}) {
  return {
    ownerDocument: doc,
    dataset: {} as Record<string, string | undefined>,
    querySelector: (selector: string) => parts[selector] ?? null,
  };
}

const asShell = (shell: ReturnType<typeof fakeShell>): HTMLElement => shell as unknown as HTMLElement;
const asDocument = (doc: FakeDocument): Document => doc as unknown as Document;

// A sidebar with the two buttons of the shell markup: the title-bar toggle and the fold button of its header.
function sidebarParts() {
  const sidebar = { contains: () => false, querySelectorAll: () => [] };
  const toggle = { ...listening(), setAttribute() {}, focus() {} };
  const collapse = {
    ...listening(),
    dataset: {} as Record<string, string | undefined>,
    title: '',
    setAttribute() {},
    closest: (selector: string) => (selector === '.im-sidebar' ? sidebar : null),
  };
  return { sidebar, toggle, collapse, parts: { '.im-sidebar': sidebar, '.im-sidebar-toggle': toggle, '.im-sidebar-collapse': collapse } };
}

// A key event as a browser gives it: `preventDefault` sets `defaultPrevented`, `stopImmediatePropagation` ends the
// dispatch. `prevented` counts the calls of `preventDefault`.
const keyEvent = (key: string, extra: Partial<KeyEventLike> & { repeat?: boolean } = {}) => ({
  ...press(key, extra),
  defaultPrevented: false,
  stopped: false,
  prevented: 0,
  preventDefault() {
    this.defaultPrevented = true;
    this.prevented++;
  },
  stopImmediatePropagation() {
    this.stopped = true;
  },
});

// A key pressed where nothing of the shell listens: the document's listeners only. Returns how often its default was prevented.
const keydown = (doc: FakeDocument, key: string, extra: Partial<KeyEventLike> & { repeat?: boolean } = {}) => {
  const event = keyEvent(key, extra);
  doc.dispatch('keydown', event);
  return event.prevented;
};

// A key pressed on something inside `region`: the document's capturing listeners, then the region's, then the
// document's own as the key bubbles up, as in a browser.
function keydownIn(doc: FakeDocument, region: { dispatch: FakeDocument['dispatch'] }, key: string, extra: Partial<KeyEventLike> & { repeat?: boolean } = {}) {
  const event = keyEvent(key, extra);
  doc.dispatch('keydown', event, 'capture');
  region.dispatch('keydown', event);
  doc.dispatch('keydown', event, 'bubble');
  return event;
}

// A layer of this kind on the stack, as a surface would push it. Returns the function that removes it; the layer's
// `close` is that function too, unless the test gives its own.
const openLayer = (kind: LayerKind, close?: () => void): (() => void) => {
  let pop = (): void => {};
  pop = pushLayer({ el: {} as unknown as HTMLElement, kind, close: close ?? (() => pop()) }, null);
  return pop;
};

// The inspector's region, `.im-inspector`: enough of an element for `inspector(shell)` to open and close it.
function inspectorRegion(doc: FakeDocument) {
  return {
    ...listening(),
    hidden: true,
    childNodes: [] as unknown[],
    ownerDocument: doc,
    append(node: unknown) {
      this.childNodes.push(node);
    },
    contains: () => false,
    hasAttribute: () => false,
  };
}

// The look and the theme an app keeps: `get` reads them, `set` writes them and records the call.
function keptAppearance(look: 'smooth' | 'oni' = 'smooth', theme: 'system' | 'light' | 'dark' = 'system') {
  const choice = { look, theme };
  const calls: { look: string; theme: string }[] = [];
  const appearance: AppearanceOptions = {
    get: () => ({ ...choice }),
    set: (next) => {
      calls.push(next);
      Object.assign(choice, next);
    },
  };
  return { choice, calls, appearance };
}

const APPEARANCE = [LOOK_SMOOTH, LOOK_ONI, THEME_SYSTEM, THEME_LIGHT, THEME_DARK];

// The registry, with what the app asked of it written down.
function loggedRegistry(log: string[], options: { detachThrows?: boolean } = {}): Registry {
  const real = createRegistry();
  return {
    ...real,
    register(next) {
      log.push(`register ${next.id}`);
      const unregister = real.register(next);
      return () => {
        log.push(`unregister ${next.id}`);
        unregister();
      };
    },
    attach(target, attachOptions) {
      log.push('attach');
      const detach = real.attach(target, attachOptions);
      return () => {
        log.push('detach');
        detach();
        if (options.detachThrows) throw new Error('detach failed');
      };
    },
  };
}

// ---------- standardCommands ----------

test('standardCommands registers Ctrl+K and Ctrl+F under the same ids in every app, titled with the default labels', () => {
  const registry = createRegistry();
  standardCommands(registry, asShell(fakeShell(fakeDocument())), { search: () => {} });

  assert.equal(PALETTE_COMMAND, 'imago.palette');
  assert.equal(SEARCH_COMMAND, 'imago.search');
  const palette = registry.get(PALETTE_COMMAND);
  const search = registry.get(SEARCH_COMMAND);
  assert.deepEqual([palette?.title, palette?.keys], ['Commands', 'Ctrl+K']);
  assert.deepEqual([search?.title, search?.keys], ['Search in this view', 'Ctrl+F']);
  assert.equal(registry.match(press('k', { ctrlKey: true }))?.id, PALETTE_COMMAND);
  assert.equal(registry.match(press('f', { ctrlKey: true }))?.id, SEARCH_COMMAND);
});

test('the titles are the labels the app gives, and a label left out keeps its default', () => {
  const words = createRegistry();
  standardCommands(words, asShell(fakeShell(fakeDocument())), {
    search: () => {},
    labels: { palette: 'Comandi', search: 'Cerca in questa vista', palettePlaceholder: 'Digita un comando', paletteEmpty: 'Nessun comando corrisponde' },
  });
  assert.equal(words.get(PALETTE_COMMAND)?.title, 'Comandi');
  assert.equal(words.get(SEARCH_COMMAND)?.title, 'Cerca in questa vista');

  const partial = createRegistry();
  standardCommands(partial, asShell(fakeShell(fakeDocument())), { search: () => {}, labels: { palette: 'Comandi', search: undefined } });
  assert.equal(partial.get(PALETTE_COMMAND)?.title, 'Comandi');
  assert.equal(partial.get(SEARCH_COMMAND)?.title, 'Search in this view', 'undefined is not a label');
});

test('Ctrl+F calls search once, cancels the browser\'s own find, and works inside a text field', () => {
  const registry = createRegistry();
  let searches = 0;
  standardCommands(registry, asShell(fakeShell(fakeDocument())), { search: () => void searches++ });
  const doc = listening();
  registry.attach(doc);

  assert.equal(keydown(doc as FakeDocument, 'f', { ctrlKey: true }), 1);
  assert.equal(searches, 1);
  keydown(doc as FakeDocument, 'f', { ctrlKey: true, target: { tagName: 'INPUT' } });
  assert.equal(searches, 2, 'a binding with Ctrl runs in a field');
  assert.equal(keydown(doc as FakeDocument, 'f'), 0, 'F alone is not the command');
  assert.equal(searches, 2);
});

test('the palette command is not offered while the palette is open, so the palette does not list itself', () => {
  const registry = createRegistry();
  standardCommands(registry, asShell(fakeShell(fakeDocument())), { search: () => {} });
  assert.deepEqual(registry.list().map((c) => c.id), [PALETTE_COMMAND, SEARCH_COMMAND]);

  // The layer is removed whatever the assertions say: one left on the stack would make every later test modal.
  const close = openLayer('palette');
  try {
    assert.deepEqual(registry.list().map((c) => c.id), [SEARCH_COMMAND]);
    assert.equal(registry.match(press('k', { ctrlKey: true })), undefined);
  } finally {
    close();
  }
  assert.deepEqual(registry.list().map((c) => c.id), [PALETTE_COMMAND, SEARCH_COMMAND]);
});

test('the function standardCommands returns removes both commands, frees their keys, and is safe to call twice', () => {
  const registry = createRegistry();
  const undo = standardCommands(registry, asShell(fakeShell(fakeDocument())), { search: () => {} });
  undo();
  assert.deepEqual(registry.list(), []);
  assert.equal(registry.match(press('k', { ctrlKey: true })), undefined);

  const own = command(PALETTE_COMMAND, 'Ctrl+K');
  registry.register(own);
  undo();
  assert.equal(registry.get(PALETTE_COMMAND), own, 'a stale undo does not remove what took the id since');
});

test('commands of the app with the same ids are the app\'s error: the registry throws, and nothing of ours stays behind', () => {
  // The registry itself decides: a duplicate id throws, and so do keys that another command holds.
  const twice = createRegistry();
  standardCommands(twice, asShell(fakeShell(fakeDocument())), { search: () => {} });
  assert.throws(() => standardCommands(twice, asShell(fakeShell(fakeDocument())), { search: () => {} }), /"imago\.palette" is already registered/);
  assert.deepEqual(twice.list().map((c) => c.id), [PALETTE_COMMAND, SEARCH_COMMAND], 'the first pair is untouched');

  // The palette command registers first: when the search command is refused, the palette command goes again.
  const taken = createRegistry();
  const own = command(SEARCH_COMMAND, 'Ctrl+Shift+F');
  taken.register(own);
  assert.throws(() => standardCommands(taken, asShell(fakeShell(fakeDocument())), { search: () => {} }), /"imago\.search" is already registered/);
  assert.deepEqual(taken.list(), [own]);
  assert.equal(taken.match(press('k', { ctrlKey: true })), undefined, 'Ctrl+K is free again');

  const keys = createRegistry();
  keys.register(command('find', 'Ctrl+F'));
  assert.throws(() => standardCommands(keys, asShell(fakeShell(fakeDocument())), { search: () => {} }), /Keys "Ctrl\+F" of "imago\.search" are already bound to "find"/);
  assert.deepEqual(keys.list().map((c) => c.id), ['find']);

  const palette = createRegistry();
  palette.register(command('open', 'Ctrl+K'));
  assert.throws(() => standardCommands(palette, asShell(fakeShell(fakeDocument())), { search: () => {} }), /Keys "Ctrl\+K" of "imago\.palette" are already bound to "open"/);
  assert.deepEqual(palette.list().map((c) => c.id), ['open']);
});

// ---------- footerKeys ----------

test('footerKeys writes the key list of the footer: per command, its key caps and its title', () => {
  const registry = createRegistry();
  registry.register(command('next', 'F6', { title: 'Next region' }));
  registry.register(command('reopen', 'Ctrl+Shift+T', { title: 'Reopen' }));

  const keys = footerKeys(asDocument(fakeDocument()), registry, ['next', 'reopen']) as unknown as FakeElement;
  assert.equal(
    keys.html,
    '<span class="im-footer-keys">' +
      '<span><kbd class="im-key">F6</kbd>Next region</span>' +
      '<span><kbd class="im-key">Ctrl</kbd><kbd class="im-key">⇧</kbd><kbd class="im-key">T</kbd>Reopen</span>' +
      '</span>',
  );
});

test('footerKeys follows the order of the ids, skips an id that is not registered or has no keys, and may be empty', () => {
  const registry = createRegistry();
  registry.register(command('a', 'a', { title: 'Analyze' }));
  registry.register(command('quiet', undefined, { title: 'No keys' }));
  registry.register(command('f', 'F2', { title: 'Rename' }));
  const doc = asDocument(fakeDocument());

  const html = (ids: string[]): string => (footerKeys(doc, registry, ids) as unknown as FakeElement).html;
  assert.equal(
    html(['f', 'missing', 'quiet', 'a']),
    '<span class="im-footer-keys"><span><kbd class="im-key">F2</kbd>Rename</span><span><kbd class="im-key">A</kbd>Analyze</span></span>',
  );
  assert.equal(html(['missing']), '<span class="im-footer-keys"></span>');
  assert.equal(html([]), '<span class="im-footer-keys"></span>');
});

test('footerKeys also lists the keys of a list, which are not commands: { keys, title }, beside the ids, in their order', () => {
  const registry = createRegistry();
  registry.register(command('clean', 'Ctrl+Enter', { title: 'Clean' }));
  const doc = asDocument(fakeDocument());

  const html = (footerKeys(doc, registry, [
    { keys: 'ArrowUp ArrowDown', title: 'Move' },
    { keys: 'Space', title: 'Toggle' },
    'clean',
    { keys: 'Enter', title: 'Open' },
  ]) as unknown as FakeElement).html;
  assert.equal(
    html,
    '<span class="im-footer-keys">' +
      '<span><kbd class="im-key">↑</kbd><kbd class="im-key">↓</kbd>Move</span>' +
      '<span><kbd class="im-key">Space</kbd>Toggle</span>' +
      '<span><kbd class="im-key">Ctrl</kbd><kbd class="im-key">↵</kbd>Clean</span>' +
      '<span><kbd class="im-key">↵</kbd>Open</span>' +
      '</span>',
    'several bindings of one entry are separated by a space; each is written as keyCaps writes it',
  );
});

test('the keys of a list are in the grammar of a command\'s keys: keys that cannot match throw', () => {
  const doc = asDocument(fakeDocument());
  assert.throws(() => footerKeys(doc, createRegistry(), [{ keys: 'Ctrl+', title: 'Broken' }]), /Invalid keys "Ctrl\+"/);
  assert.throws(() => footerKeys(doc, createRegistry(), [{ keys: 'ArrowUp Up+Down', title: 'Move' }]), /Invalid keys "Up\+Down"/);
});

// ---------- mountApp ----------

test('mountApp makes the calls of an app: Ctrl+F reaches search through the document, and the standard commands are there', () => {
  const doc = fakeDocument();
  const registry = createRegistry();
  let searches = 0;
  mountApp(asShell(fakeShell(doc)), registry, { search: () => void searches++ });

  assert.deepEqual(registry.list().map((c) => c.id), [PALETTE_COMMAND, SEARCH_COMMAND]);
  assert.equal(keydown(doc, 'f', { ctrlKey: true }), 1, 'the registry listens on the document of the shell');
  assert.equal(searches, 1);
  assert.ok(doc.active.length > 0);
});

test('mountApp calls the registry before the commands exist, and its undo goes the other way round', () => {
  const log: string[] = [];
  const undo = mountApp(asShell(fakeShell(fakeDocument())), loggedRegistry(log), { search: () => {} });
  assert.deepEqual(log, ['attach', 'register imago.palette', 'register imago.search']);
  log.length = 0;
  undo();
  assert.deepEqual(log, ['unregister imago.search', 'unregister imago.palette', 'detach']);
});

// ---------- a key is answered once ----------

test('Escape that closes the inspector runs no command of the app; the next Escape, which nothing takes, runs it', () => {
  const doc = fakeDocument();
  const region = inspectorRegion(doc);
  const shell = asShell(fakeShell(doc, { '.im-inspector': region }));
  const registry = createRegistry();
  let escapes = 0;
  registry.register(command('clear', 'Escape', { run: () => void escapes++ }));
  mountApp(shell, registry, { search: () => {} });
  const details = inspector(shell);
  details.open({ remove() {} } as unknown as HTMLElement);
  assert.equal(details.isOpen(), true);

  const first = keydownIn(doc, region, 'Escape');
  assert.equal(details.isOpen(), false, 'the first Escape closes the inspector');
  assert.equal(first.defaultPrevented, true, 'the inspector took the key');
  assert.equal(escapes, 0, 'so the command bound to Escape does not also run');

  keydown(doc, 'Escape'); // focus went back to where it was, outside the inspector
  assert.equal(escapes, 1, 'the second Escape runs the command');
});

test('a held Escape closes one view of the inspector, and its repeats run no command while focus is in it', () => {
  const doc = fakeDocument();
  const region = inspectorRegion(doc);
  const shell = asShell(fakeShell(doc, { '.im-inspector': region }));
  const registry = createRegistry();
  let escapes = 0;
  registry.register(command('clear', 'Escape', { run: () => void escapes++ }));
  mountApp(shell, registry, { search: () => {} });
  const details = inspector(shell);
  details.open({ remove() {} } as unknown as HTMLElement);

  const held = keydownIn(doc, region, 'Escape', { repeat: true });
  assert.equal(details.isOpen(), true, 'a repeat of a key pressed before closes nothing');
  assert.equal(held.defaultPrevented, true, 'and is still the inspector\'s');
  assert.equal(escapes, 0);
  keydownIn(doc, region, 'Escape');
  assert.equal(details.isOpen(), false);
  assert.equal(escapes, 0);
});

test('Escape that closes the sidebar drawer runs no command of the app: mountApp attaches the drawer before the registry', () => {
  const doc = fakeDocument();
  const { parts } = sidebarParts();
  const shell = fakeShell(doc, parts);
  const registry = createRegistry();
  let escapes = 0;
  registry.register(command('clear', 'Escape', { run: () => void escapes++ }));
  mountApp(asShell(shell), registry, { search: () => {} });
  shell.dataset.imSidebarOpen = 'true'; // the drawer is open: below 620, from its title-bar button

  assert.equal(keydown(doc, 'Escape'), 1, 'the key is taken once');
  assert.equal(shell.dataset.imSidebarOpen, undefined, 'the first Escape closes the drawer');
  assert.equal(escapes, 0, 'and runs no command');
  keydown(doc, 'Escape');
  assert.equal(escapes, 1, 'the second Escape runs the command');
});

test('Escape that closes a layer runs no command of the app: mountApp attaches the layers before the registry', () => {
  const doc = fakeDocument();
  const registry = createRegistry();
  let escapes = 0;
  registry.register(command('clear', 'Escape', { run: () => void escapes++ }));
  const undo = mountApp(asShell(fakeShell(doc)), registry, { search: () => {} });
  let closed = 0;
  const pop = openLayer('menu', () => {
    closed++;
    pop();
  });
  try {
    keydown(doc, 'Escape');
    assert.equal(closed, 1, 'the first Escape closes the menu');
    assert.equal(escapes, 0, 'and runs no command');
    keydown(doc, 'Escape');
    assert.equal(escapes, 1, 'the second Escape runs the command');
  } finally {
    pop();
    undo();
  }
});

test('F6 moves focus between the regions, and runs no command of the app bound to it: mountApp attaches the regions before the registry', () => {
  const doc = fakeDocument();
  (doc as unknown as { activeElement: null }).activeElement = null;
  let focused = 0;
  // The content region as keys.ts looks at it: rendered, a tab stop, focusable.
  const content = { getClientRects: () => [{}], matches: (selector: string) => selector === '[tabindex="0"]', closest: () => null, focus: () => void focused++, contains: () => false };
  const registry = createRegistry();
  let commands = 0;
  registry.register(command('next', 'F6', { run: () => void commands++ }));
  const globals = globalThis as unknown as { getComputedStyle?: unknown };
  const before = globals.getComputedStyle;
  globals.getComputedStyle = () => ({ visibility: 'visible' });
  const undo = mountApp(asShell(fakeShell(doc, { '.im-content': content })), registry, { search: () => {} });
  try {
    assert.equal(keydown(doc, 'F6'), 1, 'the key is taken once');
    assert.equal(focused, 1, 'by the regions');
    assert.equal(commands, 0, 'and no command of the app runs');
  } finally {
    undo();
    globals.getComputedStyle = before;
  }
});

test('Ctrl+F searches in a desktop app: guardDesktop refuses the key to the browser and leaves it to the app, in any order', () => {
  // The documented order is the guard first; the guard after mountApp is the one an app may also write.
  const orders: [string, (doc: Document, mount: () => void) => void][] = [
    ['the guard first', (doc, mount) => { guardDesktop(doc); mount(); }],
    ['the guard after mountApp', (doc, mount) => { mount(); guardDesktop(doc); }],
  ];
  for (const [order, wire] of orders) {
    const doc = fakeDocument();
    let searches = 0;
    wire(asDocument(doc), () => mountApp(asShell(fakeShell(doc)), createRegistry(), { search: () => void searches++ }));
    const event = keyEvent('f', { ctrlKey: true });
    doc.dispatch('keydown', event);
    assert.equal(searches, 1, `${order}: the search command runs once`);
    assert.equal(event.defaultPrevented, true, `${order}: and the browser's own find stays refused`);
  }
});

test('a held Escape is answered once: it closes the inspector, its repeats run no command, and after its keyup a new Escape runs it', () => {
  const doc = fakeDocument();
  const region = inspectorRegion(doc);
  const shell = asShell(fakeShell(doc, { '.im-inspector': region }));
  const registry = createRegistry();
  let escapes = 0;
  registry.register(command('clear', 'Escape', { run: () => void escapes++ }));
  mountApp(shell, registry, { search: () => {} });
  const details = inspector(shell);
  details.open({ remove() {} } as unknown as HTMLElement);

  keydownIn(doc, region, 'Escape');
  assert.equal(details.isOpen(), false, 'the press closes the inspector');
  // Focus went back to the opener: the repeats of the held key arrive outside the inspector.
  for (let held = 0; held < 3; held++) assert.equal(keydown(doc, 'Escape', { repeat: true }), 1, 'each repeat is taken');
  assert.equal(escapes, 0, 'and none runs the command bound to Escape');
  doc.dispatch('keyup', keyEvent('Escape'));
  keydown(doc, 'Escape');
  assert.equal(escapes, 1, 'after the keyup a new Escape runs it');
});

test('a held Escape that closes the sidebar drawer or a menu runs no command either while it is held', () => {
  const doc = fakeDocument();
  const { parts } = sidebarParts();
  const shell = fakeShell(doc, parts);
  const registry = createRegistry();
  let escapes = 0;
  registry.register(command('clear', 'Escape', { run: () => void escapes++ }));
  const undo = mountApp(asShell(shell), registry, { search: () => {} });

  shell.dataset.imSidebarOpen = 'true';
  keydown(doc, 'Escape');
  keydown(doc, 'Escape', { repeat: true });
  assert.equal(shell.dataset.imSidebarOpen, undefined);
  assert.equal(escapes, 0, 'the drawer: the repeat runs no command');
  doc.dispatch('keyup', keyEvent('Escape'));

  const pop = openLayer('menu');
  try {
    keydown(doc, 'Escape');
    keydown(doc, 'Escape', { repeat: true });
    assert.equal(escapes, 0, 'the menu: the repeat runs no command');
  } finally {
    pop();
    undo();
  }
});

// ---------- the look and the theme ----------

test('with appearance, mountApp registers the five look and theme commands alike in every app: same ids, group, no keys', () => {
  assert.deepEqual(APPEARANCE, ['imago.look.smooth', 'imago.look.oni', 'imago.theme.system', 'imago.theme.light', 'imago.theme.dark']);
  const registry = createRegistry();
  mountApp(asShell(fakeShell(fakeDocument())), registry, { search: () => {}, appearance: keptAppearance().appearance });

  const five = APPEARANCE.map((id) => registry.get(id));
  assert.deepEqual(five.map((c) => c?.title), ['Smooth look', 'ONI look', 'Follow Windows', 'Light theme', 'Dark theme']);
  assert.deepEqual(five.map((c) => c?.group), ['Appearance', 'Appearance', 'Appearance', 'Appearance', 'Appearance']);
  assert.deepEqual(five.map((c) => c?.keys), [undefined, undefined, undefined, undefined, undefined], 'no key is bound');

  const without = createRegistry();
  mountApp(asShell(fakeShell(fakeDocument())), without, { search: () => {} });
  assert.deepEqual(APPEARANCE.map((id) => without.get(id)), [undefined, undefined, undefined, undefined, undefined], 'without appearance there are none');
});

test('the command of the current choice is not available, so the palette offers the other choices', () => {
  const { choice, appearance } = keptAppearance('smooth', 'system');
  const registry = createRegistry();
  mountApp(asShell(fakeShell(fakeDocument())), registry, { search: () => {}, appearance });
  const offered = (): string[] => registry.list().map((c) => c.id).filter((id) => APPEARANCE.includes(id));

  assert.deepEqual(offered(), [LOOK_ONI, THEME_LIGHT, THEME_DARK]);
  // The app changed its choice by its own control: what is offered follows, because it reads get() each time.
  choice.look = 'oni';
  choice.theme = 'dark';
  assert.deepEqual(offered(), [LOOK_SMOOTH, THEME_SYSTEM, THEME_LIGHT]);
});

test('each command calls set with its own half and the other half of get() unchanged; the package keeps nothing', () => {
  const choice = { look: 'smooth' as const, theme: 'dark' as 'system' | 'light' | 'dark' };
  const calls: unknown[] = [];
  const registry = createRegistry();
  // This app's set does not change its choice yet (it would save it first, say): the package does not change it either.
  mountApp(asShell(fakeShell(fakeDocument())), registry, { search: () => {}, appearance: { get: () => ({ ...choice }), set: (next) => void calls.push(next) } });

  void registry.get(LOOK_ONI)?.run();
  void registry.get(THEME_SYSTEM)?.run();
  void registry.get(THEME_LIGHT)?.run();
  assert.deepEqual(calls, [{ look: 'oni', theme: 'dark' }, { look: 'smooth', theme: 'system' }, { look: 'smooth', theme: 'light' }]);
  assert.equal(registry.get(LOOK_SMOOTH)?.when?.(), false, 'the choice is still the app\'s');
  assert.equal(registry.get(THEME_DARK)?.when?.(), false);

  choice.theme = 'light';
  void registry.get(LOOK_ONI)?.run();
  assert.deepEqual(calls.at(-1), { look: 'oni', theme: 'light' }, 'get() is read at each run');
});

test('the command of the current choice does nothing when it is run anyway (by a key or a menu the app gives it)', () => {
  const { calls, appearance } = keptAppearance('oni', 'dark');
  const registry = createRegistry();
  mountApp(asShell(fakeShell(fakeDocument())), registry, { search: () => {}, appearance });

  void registry.get(LOOK_ONI)?.run();
  void registry.get(THEME_DARK)?.run();
  assert.deepEqual(calls, [], 'set is not called with the choice it already has');
  void registry.get(THEME_SYSTEM)?.run();
  assert.deepEqual(calls, [{ look: 'oni', theme: 'system' }]);
});

test('the titles and the group are the app\'s words; a word left out keeps its default', () => {
  const registry = createRegistry();
  mountApp(asShell(fakeShell(fakeDocument())), registry, {
    search: () => {},
    appearance: {
      ...keptAppearance().appearance,
      labels: { group: 'Aspetto', smooth: 'Aspetto Smooth', oni: 'Aspetto ONI', system: 'Segui Windows', light: 'Tema chiaro', dark: undefined },
    },
  });
  const five = APPEARANCE.map((id) => registry.get(id));
  assert.deepEqual(five.map((c) => c?.title), ['Aspetto Smooth', 'Aspetto ONI', 'Segui Windows', 'Tema chiaro', 'Dark theme']);
  assert.deepEqual(new Set(five.map((c) => c?.group)), new Set(['Aspetto']));
});

test('the appearance commands come after the standard ones, and the undo of mountApp removes them first', () => {
  const log: string[] = [];
  const undo = mountApp(asShell(fakeShell(fakeDocument())), loggedRegistry(log), { search: () => {}, appearance: keptAppearance().appearance });
  assert.deepEqual(log, ['attach', 'register imago.palette', 'register imago.search', ...APPEARANCE.map((id) => `register ${id}`)]);
  log.length = 0;
  undo();
  assert.deepEqual(log, [...[...APPEARANCE].reverse().map((id) => `unregister ${id}`), 'unregister imago.search', 'unregister imago.palette', 'detach']);
});

// ---------- the errors of mountApp ----------

test('mountApp\'s errors start with "mountApp: " and name the id or the key of the app that is in the way', () => {
  const shell = () => asShell(fakeShell(fakeDocument()));
  const startsWith = (pattern: RegExp) => (error: unknown): boolean => error instanceof Error && error.message.startsWith('mountApp: ') && pattern.test(error.message);

  const id = createRegistry();
  id.register(command(SEARCH_COMMAND));
  assert.throws(() => mountApp(shell(), id, { search: () => {} }), startsWith(/"imago\.search"/));

  const keys = createRegistry();
  keys.register(command('open', 'Ctrl+K'));
  assert.throws(() => mountApp(shell(), keys, { search: () => {} }), startsWith(/"Ctrl\+K".*"open"/));

  const look = createRegistry();
  look.register(command(LOOK_ONI));
  assert.throws(() => mountApp(shell(), look, { search: () => {}, appearance: keptAppearance().appearance }), startsWith(/"imago\.look\.oni"/));
  assert.deepEqual(look.list().map((c) => c.id), [LOOK_ONI], 'what mountApp had registered is gone again');

  // Given from plain JavaScript without set: refused when the app mounts, not when the user picks a look.
  const half = { get: keptAppearance().appearance.get } as unknown as AppearanceOptions;
  assert.throws(() => mountApp(shell(), createRegistry(), { search: () => {}, appearance: half }), startsWith(/appearance/));
  const mounted = shell();
  mountApp(mounted, createRegistry(), { search: () => {} });
  assert.throws(() => mountApp(mounted, createRegistry(), { search: () => {} }), startsWith(/already mounted/));
});

test('the function mountApp returns removes every listener, the commands and the keys, and may be called twice', () => {
  const doc = fakeDocument();
  const { parts, toggle, collapse } = sidebarParts();
  const registry = createRegistry();
  let searches = 0;
  const undo = mountApp(asShell(fakeShell(doc, parts)), registry, { search: () => void searches++ });
  assert.ok(doc.active.length > 0 && toggle.active.length > 0 && collapse.active.length > 0);

  undo();
  assert.equal(doc.active.length, 0, 'nothing is left on the document');
  assert.equal(toggle.active.length + collapse.active.length, 0, 'nor on the sidebar buttons');
  assert.deepEqual(registry.list(), []);
  assert.equal(keydown(doc, 'f', { ctrlKey: true }), 0);
  assert.equal(searches, 0);
  assert.doesNotThrow(() => undo());
});

test('mountApp closes the surfaces that are still open when its undo runs: the shell is going away', () => {
  const doc = fakeDocument();
  const undo = mountApp(asShell(fakeShell(doc)), createRegistry(), { search: () => {} });
  let closed = 0;
  const pop = openLayer('menu', () => {
    closed++;
    pop();
  });
  undo();
  assert.equal(closed, 1);
});

test('a shell without a sidebar mounts', () => {
  const doc = fakeDocument();
  const registry = createRegistry();
  const undo = mountApp(asShell(fakeShell(doc)), registry, { search: () => {}, sidebar: { collapsed: true } });
  assert.deepEqual(registry.list().map((c) => c.id), [PALETTE_COMMAND, SEARCH_COMMAND]);
  undo();
  assert.equal(doc.active.length, 0);
});

test('a shell with a sidebar gets the drawer and the fold, and the fold passes the app\'s choice back', () => {
  const doc = fakeDocument();
  const { parts, toggle, collapse } = sidebarParts();
  const shell = fakeShell(doc, parts);
  const changes: boolean[] = [];
  mountApp(asShell(shell), createRegistry(), { search: () => {}, sidebar: { collapsed: true, onChange: (value) => changes.push(value) } });

  assert.equal(toggle.active.filter((entry) => entry.type === 'click').length, 1, 'the title-bar button opens the drawer');
  assert.equal(shell.dataset.imSidebarCollapsed, 'true', 'the sidebar starts folded, as the app kept it');
  collapse.dispatch('click', {});
  assert.deepEqual(changes, [false]);
  assert.equal(shell.dataset.imSidebarCollapsed, undefined);
});

test('a second mountApp on the same shell throws, and changes nothing; once undone the shell mounts again', () => {
  const doc = fakeDocument();
  const shell = asShell(fakeShell(doc));
  const first = createRegistry();
  const undo = mountApp(shell, first, { search: () => {} });
  const listeners = doc.active.length;

  const second = createRegistry();
  assert.throws(() => mountApp(shell, second, { search: () => {} }), /already/);
  assert.throws(() => mountApp(shell, first, { search: () => {} }), /already/);
  assert.equal(doc.active.length, listeners, 'the refused calls attached nothing');
  assert.deepEqual(second.list(), [], 'and registered nothing');
  assert.deepEqual(first.list().map((c) => c.id), [PALETTE_COMMAND, SEARCH_COMMAND]);

  undo();
  const again = mountApp(shell, second, { search: () => {} });
  undo(); // the first mount's undo, called late, is not the second mount's
  assert.deepEqual(second.list().map((c) => c.id), [PALETTE_COMMAND, SEARCH_COMMAND]);
  assert.throws(() => mountApp(shell, createRegistry(), { search: () => {} }), /already/);
  again();

  const other = asShell(fakeShell(doc));
  assert.doesNotThrow(() => mountApp(other, createRegistry(), { search: () => {} }), 'a different shell is its own mount');
});

test('when the standard commands cannot be registered, mountApp undoes what it did, throws, and leaves the shell free', () => {
  const doc = fakeDocument();
  const { parts, toggle, collapse } = sidebarParts();
  const shell = asShell(fakeShell(doc, parts));
  const registry = createRegistry();
  const own = command(PALETTE_COMMAND, 'Ctrl+Shift+P');
  registry.register(own);

  assert.throws(() => mountApp(shell, registry, { search: () => {} }), /^Error: mountApp: Command "imago\.palette" is already registered/);
  assert.equal(doc.active.length, 0, 'no listener is left on the document');
  assert.equal(toggle.active.length + collapse.active.length, 0, 'or on the sidebar');
  assert.deepEqual(registry.list(), [own]);

  const clean = createRegistry();
  assert.doesNotThrow(() => mountApp(shell, clean, { search: () => {} }), 'the app fixes its registry and mounts the same shell');
});

test('an undo that throws does not keep the rest attached, and still frees the shell; the error is not lost', () => {
  const doc = fakeDocument();
  const shell = asShell(fakeShell(doc));
  const undo = mountApp(shell, loggedRegistry([], { detachThrows: true }), { search: () => {} });

  assert.throws(() => undo(), /detach failed/);
  assert.equal(doc.active.length, 0, 'the layers and the regions were let go as well');
  assert.doesNotThrow(() => mountApp(shell, createRegistry(), { search: () => {} }));
});
