import assert from 'node:assert/strict';
import test from 'node:test';
import { createZoomController } from '../ts/shell/zoom.ts';

const levels = [0.67, 0.75, 1, 1.25, 1.5, 1.75, 2];

function storage(initial: string | null) {
  const items = new Map(initial === null ? [] : [['product.zoom', initial]]);
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
}

test('custom steps retain saved desktop levels and keyboard and explicit changes share the same preference', async () => {
  const store = storage('0.67');
  const applied: number[] = [];
  const controller = createZoomController({
    storageKey: 'product.zoom', storage: store, levels, applyDefaultOnStart: false,
    apply: level => { applied.push(level); },
  });
  await controller.ready;
  assert.deepEqual(applied, [0.67]);
  await controller.set(1.25);
  const key = { key: '+', code: 'BracketRight', ctrlKey: true, shiftKey: true,
    preventDefault() {}, stopPropagation() {} } as KeyboardEvent;
  assert.equal(await controller.handleKey(key), true);
  assert.equal(controller.current(), 1.5);
  assert.equal(store.items.get('product.zoom'), '1.5');
  assert.deepEqual(applied, [0.67, 1.25, 1.5]);
});

test('an unknown saved desktop level defaults to 100% without touching the native window', async () => {
  const applied: number[] = [];
  const controller = createZoomController({ storage: storage('1.4'), storageKey: 'product.zoom', levels, applyDefaultOnStart: false, apply: level => { applied.push(level); } });
  await controller.ready;
  assert.deepEqual(applied, []);
  assert.equal(controller.current(), 1);
});

test('out-of-order native replies keep the latest accepted zoom and roll back overlapping refusals', async () => {
  const store = storage(null);
  const replies: Array<{ resolve(): void; reject(): void }> = [];
  const controller = createZoomController({
    storage: store, storageKey: 'product.zoom', levels, applyDefaultOnStart: false,
    apply: () => new Promise<void>((resolve, reject) => replies.push({ resolve, reject })),
  });
  await controller.ready;
  const first = controller.set(1.25);
  const second = controller.set(1.5);
  replies[1].resolve(); assert.equal(await second, true);
  replies[0].resolve(); await first;
  assert.equal(store.items.get('product.zoom'), '1.5');
  const third = controller.set(1.75);
  const fourth = controller.set(2);
  replies[2].reject(); assert.equal(await third, false);
  replies[3].reject(); assert.equal(await fourth, false);
  assert.equal(controller.current(), 1.5);
  assert.equal(store.items.get('product.zoom'), '1.5');
});

test('native throws during restore or explicit changes restore the last accepted level', async () => {
  const notices: number[] = [];
  const controller = createZoomController({
    storageKey: 'product.zoom', storage: storage('1.25'), levels,
    apply() { throw new Error('window unavailable'); }, onChange: level => notices.push(level),
  });
  await controller.ready;
  assert.equal(controller.current(), 1);
  assert.equal(await controller.set(1.75), false);
  assert.deepEqual(notices, [1.75, 1]);
});
