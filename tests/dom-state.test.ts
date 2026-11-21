import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusKey, captureFocus, restoreFocus, captureDomState, restoreDomState, replaceHtmlRegion } from '../ts/ui/dom-state.ts';

class ElementFixture {
  attributes: Record<string, string>;
  localName: string;
  disabled = false;
  hidden = false;
  open = false;
  scrollTop = 0;
  scrollLeft = 0;
  selectionStart: number | null = null;
  selectionEnd: number | null = null;
  selectionDirection: 'forward' | 'backward' | 'none' = 'none';
  selected: unknown[] | null = null;
  focused: FocusOptions | null = null;
  ownerDocument: { activeElement: ElementFixture | null } = { activeElement: null };
  children = new Set<ElementFixture>();
  queries = new Map<string, ElementFixture[]>();
  graphParent: ElementFixture | null = null;
  classList = { contains: (name: string) => (this.attributes.class ?? '').split(' ').includes(name) };
  constructor(tag: string, attributes: Record<string, string> = {}) { this.localName = tag; this.attributes = attributes; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  hasAttribute(name: string) { return Object.hasOwn(this.attributes, name); }
  contains(element: ElementFixture) { return this.children.has(element); }
  matches(selector: string) { assert.equal(selector, ':disabled'); return this.disabled; }
  closest(selector: string) { return selector === '[data-im-node]' ? this.graphParent : this.hidden ? this : null; }
  focus(options: FocusOptions) { this.focused = options; }
  setSelectionRange(...selection: unknown[]) { this.selected = selection; }
  querySelector(selector: string) { return this.queries.get(selector)?.[0] ?? null; }
  querySelectorAll(selector: string) { return this.queries.get(selector) ?? []; }
  add(element: ElementFixture, selector?: string) {
    this.children.add(element);
    if (selector) this.queries.set(selector, [...(this.queries.get(selector) ?? []), element]);
    return element;
  }
  asElement() { return this as unknown as HTMLElement; }
}

test('focus identity is local, explicit keys win, and CSS strings cannot escape their attribute', () => {
  const root = new ElementFixture('div');
  const item = root.add(new ElementFixture('button', { 'data-im-key': 'x"\n] > button', id: 'ignored' }));
  assert.equal(focusKey(item.asElement(), root.asElement()), '[data-im-key="x\\"\\a ] > button"]');
  assert.equal(focusKey(new ElementFixture('button', { id: 'outside' }).asElement(), root.asElement()), '');
  assert.equal(focusKey(root.asElement(), root.asElement()), '');
  const radio = root.add(new ElementFixture('input', { name: 'choice', type: 'radio', value: 'second' }));
  assert.equal(focusKey(radio.asElement(), root.asElement()), 'input[name="choice"][value="second"]');
  const text = root.add(new ElementFixture('input', { name: 'query', type: 'text', value: 'changes' }));
  assert.equal(focusKey(text.asElement(), root.asElement()), 'input[name="query"]');
});

test('graph node selection and open buttons retain distinct focus targets across remounts', () => {
  const root = new ElementFixture('div');
  const card = new ElementFixture('div', { 'data-im-node': 'node"1' });
  for (const kind of ['im-graph-node', 'im-graph-open', 'im-graph-expand']) {
    const control = root.add(new ElementFixture('button', { class: kind }));
    control.graphParent = card;
    assert.equal(focusKey(control.asElement(), root.asElement()), `[data-im-node="node\\"1"] > .${kind}`);
  }
});

test('replacing a text control restores its selection direction without scrolling it into view', () => {
  const root = new ElementFixture('div');
  const original = root.add(new ElementFixture('textarea', { id: 'notes' }));
  root.ownerDocument.activeElement = original;
  original.selectionStart = 2; original.selectionEnd = 7; original.selectionDirection = 'backward';
  const snapshot = captureFocus(root.asElement());
  const replacement = new ElementFixture('textarea', { id: 'notes' });
  root.queries.set('[id="notes"]', [replacement]);
  assert.equal(restoreFocus(root.asElement(), snapshot), replacement);
  assert.deepEqual(replacement.focused, { preventScroll: true });
  assert.deepEqual(replacement.selected, [2, 7, 'backward']);
});

test('disabled or inert targets use the supplied fallback without copying the selection into it', () => {
  const root = new ElementFixture('div');
  const candidate = new ElementFixture('input', { id: 'name' });
  const fallback = new ElementFixture('main');
  root.queries.set('[id="name"]', [candidate]);
  const snapshot = { key: '[id="name"]', selection: { start: 1, end: 2, direction: 'none' as const } };
  candidate.disabled = true;
  assert.equal(restoreFocus(root.asElement(), snapshot, { fallback: fallback.asElement() }), fallback);
  assert.equal(fallback.selected, null);
  candidate.disabled = false; candidate.hidden = true;
  assert.equal(restoreFocus(root.asElement(), snapshot), null);
  candidate.hidden = false;
  assert.equal(restoreFocus(root.asElement(), snapshot), candidate);
});

test('details open and closed state and each scroll region survive replacing the content', () => {
  const root = new ElementFixture('div');
  const first = root.add(new ElementFixture('details', { id: 'first' }), 'details[id],details[data-im-key]');
  const second = root.add(new ElementFixture('details', { 'data-im-key': 'second' }), 'details[id],details[data-im-key]');
  first.open = true;
  const left = root.add(new ElementFixture('div'), '.pane'); left.scrollTop = 50; left.scrollLeft = 3;
  const right = root.add(new ElementFixture('div'), '.pane'); right.scrollTop = 90; right.scrollLeft = 21;
  const snapshot = captureDomState(root.asElement(), { scroll: ['.pane'] });
  const firstNew = new ElementFixture('details');
  const secondNew = new ElementFixture('details'); secondNew.open = true;
  const leftNew = new ElementFixture('div'), rightNew = new ElementFixture('div');
  root.queries.set('[id="first"]', [firstNew]);
  root.queries.set('[data-im-key="second"]', [secondNew]);
  root.queries.set('.pane', [leftNew, rightNew]);
  restoreDomState(root.asElement(), snapshot, { focus: false });
  assert.equal(firstNew.open, true);
  assert.equal(secondNew.open, false);
  assert.deepEqual([leftNew.scrollTop, leftNew.scrollLeft, rightNew.scrollTop, rightNew.scrollLeft], [50, 3, 90, 21]);
});

test('a changed input type without text selection cannot break repaint restoration', () => {
  const root = new ElementFixture('div');
  const control = new ElementFixture('input');
  control.setSelectionRange = () => { throw new Error('InvalidStateError'); };
  root.queries.set('[id="value"]', [control]);
  assert.doesNotThrow(() => restoreFocus(root.asElement(), {
    key: '[id="value"]', selection: { start: 0, end: 1, direction: 'none' },
  }));
  const noText = root.add(new ElementFixture('input', { id: 'number' }));
  root.ownerDocument.activeElement = noText;
  assert.deepEqual(captureFocus(root.asElement()), { key: '[id="number"]', selection: null });
});

test('region replacement keeps root scroll and detail state and never steals outside focus', () => {
  const region = new ElementFixture('details'); region.open = true; region.scrollTop = 25; region.scrollLeft = 10;
  const replacement = new ElementFixture('details');
  const external = new ElementFixture('button');
  const document = { activeElement: external, body: new ElementFixture('body'), createElement: () => ({
    innerHTML: '', content: { firstElementChild: replacement, childElementCount: 1, childNodes: [] },
  }) };
  region.ownerDocument = document;
  let replaced = false;
  Object.assign(region, { replaceWith: (element: ElementFixture) => { assert.equal(element, replacement); replaced = true; } });
  const result = replaceHtmlRegion(region.asElement(), '<details></details>', { fallbackFocus: () => { throw new Error('outside focus was stolen'); } });
  assert.equal(result, replacement);
  assert.equal(replaced, true);
  assert.equal(replacement.open, true);
  assert.deepEqual([replacement.scrollTop, replacement.scrollLeft], [25, 10]);
  assert.equal(replacement.focused, null);
});

test('region replacement rejects multiple roots before altering the original', () => {
  const region = new ElementFixture('div');
  region.ownerDocument = { activeElement: null, createElement: () => ({
    innerHTML: '', content: { firstElementChild: new ElementFixture('div'), childElementCount: 2, childNodes: [] },
  }) } as unknown as typeof region.ownerDocument;
  Object.assign(region, { replaceWith: () => { throw new Error('should not replace'); } });
  assert.throws(() => replaceHtmlRegion(region.asElement(), '<div></div><div></div>'), /exactly one HTML element/);
});
