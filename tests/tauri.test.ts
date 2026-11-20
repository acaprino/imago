import assert from 'node:assert/strict';
import test from 'node:test';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { tauriWindowApi } from '@acaprino/imago/tauri';

test('the adapter sends native caption commands and translates hover events until disposed', async () => {
  Object.defineProperty(globalThis, 'window', { value: { crypto: globalThis.crypto }, configurable: true });
  try {
    const calls: string[] = [];
    const rect = { x: 4, y: 6, width: 40, height: 24 };
    mockWindows('main');
    mockIPC((command, args) => {
      calls.push(command);
      if (command === 'window_caption_maximize') assert.deepEqual(args, rect);
    }, { shouldMockEvents: true });
    const api = tauriWindowApi((_action, error) => { throw error; });
    await api.minimize();
    await api.toggleMaximize();
    await api.reportMaximizeRect(rect);
    await api.close();
    assert.deepEqual(calls, ['plugin:window|minimize', 'plugin:window|toggle_maximize', 'window_caption_maximize', 'plugin:window|close']);
    const seen: string[] = [];
    const stop = api.onOsHover(state => seen.push(state));
    for (const [hover, pressed] of [[true, false], [true, true], [false, false]]) {
      await emit('caption-maximize', { hover, pressed });
    }
    stop();
    await new Promise(resolve => setImmediate(resolve));
    await emit('caption-maximize', { hover: true, pressed: false });
    assert.deepEqual(seen, ['hover', 'pressed', 'none']);
  } finally {
    clearMocks();
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('disposal reports a failed asynchronous unlisten once', async () => {
  Object.defineProperty(globalThis, 'window', { value: { crypto: globalThis.crypto }, configurable: true });
  try {
    mockWindows('main');
    const failure = new Error('window already closed');
    let removals = 0;
    mockIPC(command => {
      if (command === 'plugin:event|unlisten') {
        removals++;
        throw failure;
      }
      return 1;
    });
    const errors: unknown[] = [];
    const api = tauriWindowApi((_action, error) => errors.push(error));
    const stop = api.onOsHover(() => {});
    stop();
    stop();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(removals, 1);
    assert.deepEqual(errors, [failure]);
  } finally {
    clearMocks();
    Reflect.deleteProperty(globalThis, 'window');
  }
});
