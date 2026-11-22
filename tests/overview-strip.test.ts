import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { overviewStrip, type OverviewStripOptions } from '../ts/ui/overview-strip.ts';
import { StubDocument, type StubElement } from './dom-stub.ts';

// The strip builds its elements with the global `document`: a stub stands in for it while this file runs.
const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
before(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: new StubDocument() });
});
after(() => {
  if (original) Object.defineProperty(globalThis, 'document', original);
  else Reflect.deleteProperty(globalThis, 'document');
});

const handlers: OverviewStripOptions = { press: () => false, drag() {}, release() {}, wheel() {} };
type Placed = { element: StubElement; place: (placement: Partial<OverviewStripOptions>) => void };
const strip = (placement: Partial<OverviewStripOptions> = {}): Placed => {
  const made = overviewStrip({ ...handlers, ...placement });
  return { element: made.element as unknown as StubElement, place: made.place };
};
const style = (element: StubElement, property: string): string => (element.style as unknown as { getPropertyValue(name: string): string }).getPropertyValue(property);

test('a strip given no placement writes none: the stylesheet default (the whole edge, 20px wide) stands', () => {
  const { element } = strip();
  assert.equal(element.getAttribute('style'), null);
});

test('the placement options are written to the properties the stylesheet reads: a number is pixels, a string a length', () => {
  const { element } = strip({ top: 24, end: '8px', bottom: 'var(--im-s-4)', width: 16 });
  assert.equal(style(element, '--im-overview-top'), '24px');
  assert.equal(style(element, '--im-overview-end'), '8px');
  assert.equal(style(element, '--im-overview-bottom'), 'var(--im-s-4)');
  assert.equal(style(element, '--im-overview-width'), '16px');
});

test('zero is a placement too, and a side left out is not written', () => {
  const { element } = strip({ top: 0, width: 12 });
  assert.equal(style(element, '--im-overview-top'), '0px');
  assert.equal(style(element, '--im-overview-width'), '12px');
  assert.equal(style(element, '--im-overview-end'), '');
  assert.equal(style(element, '--im-overview-bottom'), '');
});

test('place() moves the strip: the sides it is given change, the others stay', () => {
  const placed = strip({ top: 10, width: 20 });
  placed.place({ top: 30, bottom: 4 });
  assert.equal(style(placed.element, '--im-overview-top'), '30px');
  assert.equal(style(placed.element, '--im-overview-bottom'), '4px');
  assert.equal(style(placed.element, '--im-overview-width'), '20px');
});

test('the strip is still the aria-hidden pointer shortcut with its band, trace and frame', () => {
  const { element } = strip({ top: 1 });
  assert.equal(element.className, 'im-overview');
  assert.equal(element.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(element.children.map((child) => child.className || child.localName), ['im-overview-band', 'canvas', 'im-overview-frame']);
});

test('the stylesheet reads exactly the properties the strip writes', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../css/overview-strip.css', import.meta.url), 'utf8');
  const read = new Set([...css.matchAll(/var\((--im-overview-[a-z]+)/g)].map((found) => found[1]));
  assert.deepEqual([...read].sort(), ['--im-overview-bottom', '--im-overview-end', '--im-overview-top', '--im-overview-width']);
});
