import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { claimKey, keyClaimed } from '../ts/ui/key-claim.ts';

// A document that keeps its listeners, capturing ones first as in a browser, and an event dispatched on it.
type Listener = (event: never) => void;
function fakeDocument() {
  const active: { type: string; listener: Listener; capture: boolean }[] = [];
  const doc = {
    nodeType: 9,
    active,
    addEventListener(type: string, listener: Listener, capture: boolean | { capture?: boolean } = false) {
      active.push({ type, listener, capture: typeof capture === 'object' ? capture.capture === true : capture });
    },
    removeEventListener(type: string, listener: Listener, capture: boolean | { capture?: boolean } = false) {
      const wanted = typeof capture === 'object' ? capture.capture === true : capture;
      const at = active.findIndex((entry) => entry.type === type && entry.listener === listener && entry.capture === wanted);
      if (at !== -1) active.splice(at, 1);
    },
    fire(type: string, key: string, repeat = false) {
      const event = { type, key, repeat, currentTarget: doc as unknown, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      const ours = active.filter((entry) => entry.type === type);
      for (const entry of [...ours.filter((e) => e.capture), ...ours.filter((e) => !e.capture)]) (entry.listener as (event: unknown) => void)(event);
      return event;
    },
  };
  return doc;
}

test('a claimed key is known by its event, and nothing is written on the event', () => {
  const event = { key: 'ArrowDown', preventDefault() {} };
  const before = Object.keys(event);
  assert.equal(keyClaimed(event), false);
  claimKey(event);
  assert.equal(keyClaimed(event), true);
  assert.deepEqual(Object.keys(event), before, 'the claim is kept beside the event (a WeakSet), not on it');
  assert.equal(keyClaimed({ key: 'ArrowDown' }), false, 'another event of the same key is not claimed');
});

test('key-claim.ts is a leaf: it imports nothing, so every module of ts/ui may use it, and nothing of ts/shell', () => {
  const source = readFileSync(new URL('../ts/ui/key-claim.ts', import.meta.url), 'utf8');
  assert.deepEqual(source.match(/^\s*(?:import|export)\b.*\bfrom\s+['"][^'"]+['"]/gm) ?? [], []);
});

test('a claimed Escape stays claimed until its keyup: its repeats are claimed and prevented', () => {
  const doc = fakeDocument();
  const first = doc.fire('keydown', 'Escape');
  claimKey(first); // a surface closed on it, while the event was on this document

  for (let held = 0; held < 3; held++) {
    const repeat = doc.fire('keydown', 'Escape', true);
    assert.equal(keyClaimed(repeat), true, 'a repeat of the held key is claimed');
    assert.equal(repeat.defaultPrevented, true, 'and prevented, so a handler that reads only that leaves it too');
  }
  doc.fire('keyup', 'Escape');
  assert.equal(doc.active.length, 0, 'the keyup lets go of the document');
  const again = doc.fire('keydown', 'Escape');
  assert.equal(keyClaimed(again), false, 'a new press is nobody\'s until a handler claims it');
  assert.equal(again.defaultPrevented, false);
});

test('a new press of Escape ends a hold whose keyup never came (the window lost focus while it was held)', () => {
  const doc = fakeDocument();
  claimKey(doc.fire('keydown', 'Escape'));
  const fresh = doc.fire('keydown', 'Escape'); // not a repeat: the key went up while the window could not see it
  assert.equal(keyClaimed(fresh), false);
  assert.equal(doc.active.length, 0);
  assert.equal(keyClaimed(doc.fire('keydown', 'Escape', true)), false, 'its repeats are not claimed by the old hold');
});

test('a new press that a handler listening before the hold claims (the layers) is held as well', () => {
  const doc = fakeDocument();
  // The layer stack listens from the mount on, so before the hold's own listener; it claims every Escape it answers.
  doc.addEventListener('keydown', (event: { key: string; repeat: boolean }) => {
    if (event.key === 'Escape' && !event.repeat) claimKey(event);
  }, true);
  doc.fire('keydown', 'Escape');
  doc.fire('keyup', 'Escape');
  doc.fire('keydown', 'Escape'); // the hold of the first press ended with its keyup; this one is held anew
  assert.equal(keyClaimed(doc.fire('keydown', 'Escape', true)), true);
  doc.fire('keydown', 'Escape'); // a new press with no keyup in between: claimed before the old hold sees it
  assert.equal(keyClaimed(doc.fire('keydown', 'Escape', true)), true, 'its repeats are still claimed');
});

test('only Escape is held: the repeats of a claimed arrow keep moving the list they move', () => {
  const doc = fakeDocument();
  claimKey(doc.fire('keydown', 'ArrowDown'));
  assert.equal(doc.active.length, 0, 'no hold for a key that does not close anything');
  assert.equal(keyClaimed(doc.fire('keydown', 'ArrowDown', true)), false);
});

test('an event with no document to listen on is still claimed, and holds nothing', () => {
  const event = { key: 'Escape', preventDefault() {} };
  claimKey(event);
  assert.equal(keyClaimed(event), true);
});
