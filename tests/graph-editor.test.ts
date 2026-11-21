import test from 'node:test';
import assert from 'node:assert/strict';
import { graphGesture } from '../ts/graph-editor.ts';

function fixture() {
  class Target extends EventTarget {
    ownerDocument = new EventTarget();
    captured: number | null = null;
    setPointerCapture(pointer: number) { this.captured = pointer; }
    hasPointerCapture(pointer: number) { return pointer === this.captured; }
    releasePointerCapture() { this.captured = null; }
  }
  const target = new Target();
  const calls: string[] = [];
  const pointer = (type: string, x: number, id = 2) => target.dispatchEvent(Object.assign(new Event(type), {
    clientX: x, clientY: 0, pointerId: id,
  }));
  target.addEventListener('pointerdown', event => graphGesture(event as PointerEvent, {
    move: () => calls.push('move'), release: (_, moved) => calls.push(moved ? 'drop' : 'activate'),
    cancel: () => calls.push('cancel'),
  }));
  pointer('pointerdown', 10);
  return { target, calls, pointer };
}

test('graph drag ignores other pointers and releases exactly once', () => {
  const { target, calls, pointer } = fixture();
  pointer('pointermove', 30, 3);
  pointer('pointerup', 30, 3);
  pointer('pointermove', 12);
  assert.deepEqual(calls, []);
  pointer('pointermove', 14);
  pointer('pointerup', 14);
  pointer('lostpointercapture', 14);
  assert.deepEqual(calls, ['move', 'drop']);
  assert.equal(target.captured, null);
});

test('a stationary graph gesture activates and Escape cancels a moving gesture', () => {
  const click = fixture();
  click.pointer('pointerup', 10);
  assert.deepEqual(click.calls, ['activate']);
  const drag = fixture();
  drag.pointer('pointermove', 40);
  drag.target.ownerDocument.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  drag.pointer('pointerup', 40);
  assert.deepEqual(drag.calls, ['move', 'cancel']);
  assert.equal(drag.target.captured, null);
});
