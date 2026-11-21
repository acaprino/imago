import assert from 'node:assert/strict';
import test from 'node:test';
import { createZoomController, type ZoomOptions } from '../ts/shell/zoom.ts';

function storage(initial: string | null) {
  const items = new Map(initial === null ? [] : [['product.zoom', initial]]);
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
}

const plus = { key: '+', code: 'BracketRight', ctrlKey: true, shiftKey: true,
  preventDefault() {}, stopPropagation() {} } as KeyboardEvent;

test('a saved level that is not a multiple of 10 is rounded to the nearest one, half up, and kept inside 50 to 200', async () => {
  const cases: Array<[string, number]> = [
    ['0.67', 0.7], ['1.75', 1.8], ['1.25', 1.3], ['0.75', 0.8], ['1.5', 1.5], ['1.24', 1.2],
    ['0.3', 0.5], ['9', 2], ['-1', 0.5],
  ];
  for (const [saved, expected] of cases) {
    const applied: number[] = [];
    const controller = createZoomController({ storageKey: 'product.zoom', storage: storage(saved), apply: level => { applied.push(level); } });
    await controller.ready;
    assert.equal(controller.current(), expected, `a saved ${saved}`);
    assert.deepEqual(applied, [expected], `the webview gets ${expected} for a saved ${saved}`);
  }
});

test('a saved level that is not a number is 100% and does not touch the native window when the host starts there', async () => {
  for (const saved of [null, '', '  ', 'wide']) {
    const applied: number[] = [];
    const controller = createZoomController({ storage: storage(saved), storageKey: 'product.zoom', applyDefaultOnStart: false, apply: level => { applied.push(level); } });
    await controller.ready;
    assert.deepEqual(applied, [], `a saved ${JSON.stringify(saved)}`);
    assert.equal(controller.current(), 1);
  }
});

test('keyboard and explicit changes share one preference, in steps of 10, from a level that was rounded', async () => {
  const store = storage('0.67');
  const applied: number[] = [];
  const controller = createZoomController({
    storageKey: 'product.zoom', storage: store, applyDefaultOnStart: false,
    apply: level => { applied.push(level); },
  });
  await controller.ready;
  assert.deepEqual(applied, [0.7]);
  await controller.set(1.25);
  assert.equal(controller.current(), 1.3, 'an explicit level is rounded the same way');
  assert.equal(await controller.handleKey(plus), true);
  assert.equal(controller.current(), 1.4);
  assert.equal(store.items.get('product.zoom'), '1.4');
  assert.deepEqual(applied, [0.7, 1.3, 1.4]);
});

test('the steps are 10 and cannot be changed: a levels option from an older version is ignored', async () => {
  const applied: number[] = [];
  const old = { storageKey: 'product.zoom', storage: storage('0.67'), applyDefaultOnStart: false, levels: [0.67, 0.75, 1, 1.25, 1.5, 1.75, 2],
    apply: (level: number) => { applied.push(level); } } as ZoomOptions;
  const controller = createZoomController(old);
  await controller.ready;
  assert.equal(await controller.handleKey(plus), true);
  assert.deepEqual(applied, [0.7, 0.8], 'the saved 67 became 70 and one step up is 80, not the next browser step');
  assert.doesNotThrow(() => createZoomController({ ...old, levels: [0.75, 1.5] } as ZoomOptions), 'levels that were not valid before are no longer checked');
});

test('out-of-order native replies keep the latest accepted zoom and roll back overlapping refusals', async () => {
  const store = storage(null);
  const replies: Array<{ resolve(): void; reject(): void }> = [];
  const controller = createZoomController({
    storage: store, storageKey: 'product.zoom', applyDefaultOnStart: false,
    apply: () => new Promise<void>((resolve, reject) => replies.push({ resolve, reject })),
  });
  await controller.ready;
  const first = controller.set(1.2);
  const second = controller.set(1.5);
  replies[1].resolve(); assert.equal(await second, true);
  replies[0].resolve(); await first;
  assert.equal(store.items.get('product.zoom'), '1.5');
  const third = controller.set(1.7);
  const fourth = controller.set(2);
  replies[2].reject(); assert.equal(await third, false);
  replies[3].reject(); assert.equal(await fourth, false);
  assert.equal(controller.current(), 1.5);
  assert.equal(store.items.get('product.zoom'), '1.5');
});

test('native throws during restore or explicit changes restore the last accepted level', async () => {
  const notices: number[] = [];
  const controller = createZoomController({
    storageKey: 'product.zoom', storage: storage('1.25'),
    apply() { throw new Error('window unavailable'); }, onChange: level => notices.push(level),
  });
  await controller.ready;
  assert.equal(controller.current(), 1);
  assert.equal(await controller.set(1.7), false);
  assert.deepEqual(notices, [1.7, 1]);
});

test('a refused step goes back to the rounded level and is not saved', async () => {
  const store = storage('0.67');
  let accept = true;
  const applied: number[] = [];
  const controller = createZoomController({
    storageKey: 'product.zoom', storage: store, applyDefaultOnStart: false,
    apply(level) { applied.push(level); if (!accept) throw new Error('window refused'); },
  });
  await controller.ready;
  assert.equal(controller.current(), 0.7);
  accept = false;
  assert.equal(await controller.handleKey(plus), false);
  assert.equal(controller.current(), 0.7, 'the refused 80 does not stay');
  assert.equal(store.items.get('product.zoom'), '0.67', 'a refused level is not saved: what was saved stays');
  assert.deepEqual(applied, [0.7, 0.8]);
});
