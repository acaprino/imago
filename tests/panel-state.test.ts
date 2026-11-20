import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOADING_DELAY_MS, showAfter } from '../ts/ui/panel-state.ts';

// A clock the test moves by hand: a timer fires when the clock reaches its time.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn: () => void, ms: number): unknown {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear(id: unknown): void {
      pending.delete(id as number);
    },
    advance(ms: number): void {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.fn();
        }
      }
    },
    get pending(): number {
      return pending.size;
    },
  };
}

test('the loading delay is 300 ms', () => {
  assert.equal(LOADING_DELAY_MS, 300);
});

test('cancelling at 299 ms means show never runs', () => {
  const timers = fakeTimers();
  let shown = 0;
  const cancel = showAfter(LOADING_DELAY_MS, () => shown++, timers);
  timers.advance(299);
  assert.equal(shown, 0, 'nothing is shown before the delay');
  cancel();
  timers.advance(1000);
  assert.equal(shown, 0, 'a cancelled show never runs');
  assert.equal(timers.pending, 0, 'cancelling clears the timer');
});

test('at 300 ms show runs once', () => {
  const timers = fakeTimers();
  let shown = 0;
  showAfter(LOADING_DELAY_MS, () => shown++, timers);
  timers.advance(299);
  assert.equal(shown, 0);
  timers.advance(1);
  assert.equal(shown, 1);
  timers.advance(5000);
  assert.equal(shown, 1, 'show does not run again');
});

test('cancelling after show has run is harmless and runs nothing more', () => {
  const timers = fakeTimers();
  let shown = 0;
  const cancel = showAfter(300, () => shown++, timers);
  timers.advance(300);
  cancel();
  cancel();
  timers.advance(1000);
  assert.equal(shown, 1);
});

test('cancelling twice clears the timer once', () => {
  let cleared = 0;
  const cancel = showAfter(300, () => {}, { set: () => 7, clear: () => void cleared++ });
  cancel();
  cancel();
  assert.equal(cleared, 1);
});

test('without injected timers it uses the real clock and honours cancel', async () => {
  let shown = 0;
  const cancel = showAfter(20, () => shown++);
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(shown, 0, 'cancelled before the delay');

  showAfter(20, () => shown++);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(shown, 1, 'ran once after the delay');
});
