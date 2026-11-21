import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistry } from '../ts/ui/commands.ts';
import type { Command, KeyEventLike, Registry } from '../ts/ui/commands.ts';
import { footerKeys, mountApp, PALETTE_COMMAND, SEARCH_COMMAND, standardCommands } from '../ts/ui/app.ts';
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
    // Capturing listeners run before the others, as in a browser.
    dispatch(type: string, event: unknown) {
      const ours = active.filter((entry) => entry.type === type);
      for (const entry of [...ours.filter((e) => e.capture), ...ours.filter((e) => !e.capture)]) (entry.listener as (event: unknown) => void)(event);
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
  const toggle = { ...listening(), setAttribute() {} };
  const collapse = {
    ...listening(),
    dataset: {} as Record<string, string | undefined>,
    title: '',
    setAttribute() {},
    closest: (selector: string) => (selector === '.im-sidebar' ? sidebar : null),
  };
  return { sidebar, toggle, collapse, parts: { '.im-sidebar': sidebar, '.im-sidebar-toggle': toggle, '.im-sidebar-collapse': collapse } };
}

const keydown = (doc: FakeDocument, key: string, extra: Partial<KeyEventLike> = {}) => {
  let prevented = 0;
  doc.dispatch('keydown', { ...press(key, extra), preventDefault: () => void prevented++ });
  return prevented;
};

// A layer of this kind on the stack, as a surface would push it. Returns the function that removes it.
const openLayer = (kind: LayerKind, close: () => void = () => pop()): (() => void) => {
  let pop = (): void => {};
  pop = pushLayer({ el: {} as unknown as HTMLElement, kind, close }, null);
  return pop;
};

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

  const close = openLayer('palette');
  assert.deepEqual(registry.list().map((c) => c.id), [SEARCH_COMMAND]);
  assert.equal(registry.match(press('k', { ctrlKey: true })), undefined);
  close();
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

  assert.throws(() => mountApp(shell, registry, { search: () => {} }), /"imago\.palette" is already registered/);
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
